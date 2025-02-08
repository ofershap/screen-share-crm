export default {
	async fetch(request, env) {
		try {
			console.log(`[Request] ${request.method} ${request.url}`);

			if (request.headers.get('Upgrade') === 'websocket') {
				console.log('[WebSocket] New connection request');
				return handleWebSocket(request, env);
			}

			const { searchParams } = new URL(request.url);
			const action = searchParams.get('action');
			console.log(`[HTTP] Action requested: ${action}`);

			switch (action) {
				case 'chat':
					return handleChatRequest(request, env);
				case 'transcribe':
					return handleTranscription(request, env);
				default:
					return new Response('OK'); // Return a default response for health checks
			}
		} catch (error) {
			console.error('[Error]', error);
			return new Response('Internal Server Error', { status: 500 });
		}
	},
};

// Maintain conversation context per connection
const conversationContexts = new Map();

// 🟢 WebSocket Handler for real-time conversation and screen sharing
async function handleWebSocket(request, env) {
	try {
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		// Accept the WebSocket connection
		server.accept();
		console.log('[WebSocket] Connection accepted');

		// Initialize conversation context
		const connectionId = crypto.randomUUID();
		conversationContexts.set(connectionId, {
			messageHistory: [],
			lastScreenDescription: null,
			lastTranscription: null,
			lastPing: Date.now(),
		});

		// Set up ping interval
		const pingInterval = setInterval(() => {
			try {
				if (server.readyState === 1) {
					// WebSocket.OPEN
					const context = conversationContexts.get(connectionId);
					if (context && Date.now() - context.lastPing > 45000) {
						console.log('[WebSocket] No ping received, closing connection');
						server.close(1000, 'Ping timeout');
						clearInterval(pingInterval);
						conversationContexts.delete(connectionId);
					}
				} else {
					clearInterval(pingInterval);
					conversationContexts.delete(connectionId);
				}
			} catch (error) {
				console.error('[WebSocket] Error in ping interval:', error);
				clearInterval(pingInterval);
			}
		}, 30000);

		// Handle incoming messages
		server.addEventListener('message', async (event) => {
			try {
				const data = JSON.parse(event.data);
				const { type, payload, messageId } = data;
				console.log(`[WebSocket] Received message type: ${type}`);

				const context = conversationContexts.get(connectionId);
				if (!context) {
					console.error('[WebSocket] No context found for connection');
					server.send(
						JSON.stringify({
							type: 'error',
							payload: {
								content: 'Session expired. Please refresh the page.',
								timestamp: Date.now(),
							},
							messageId: 'error',
						})
					);
					return;
				}

				// Update last ping time
				context.lastPing = Date.now();

				// Handle ping messages
				if (type === 'ping') {
					server.send(
						JSON.stringify({
							type: 'ack',
							payload: {
								content: 'pong',
								timestamp: Date.now(),
							},
							messageId,
						})
					);
					return;
				}

				// Send acknowledgment for non-ping messages
				server.send(
					JSON.stringify({
						type: 'ack',
						payload: {
							content: 'Message received',
							timestamp: Date.now(),
						},
						messageId,
					})
				);

				// Process message based on type
				switch (type) {
					case 'screen_data':
						await handleScreenData(payload, context, server, env);
						break;
					case 'voice_data':
						await handleVoiceData(payload, context, server, env);
						break;
					case 'chat':
						await handleChatMessage(payload.message, context, server, env);
						break;
					default:
						server.send(
							JSON.stringify({
								type: 'error',
								payload: {
									content: `Unknown message type: ${type}`,
									timestamp: Date.now(),
								},
								messageId,
							})
						);
				}
			} catch (error) {
				console.error('[WebSocket] Error processing message:', error);
				server.send(
					JSON.stringify({
						type: 'error',
						payload: {
							content: 'Failed to process message: ' + error.message,
							timestamp: Date.now(),
						},
						messageId: 'error',
					})
				);
			}
		});

		// Handle WebSocket closure
		server.addEventListener('close', () => {
			console.log('[WebSocket] Connection closed');
			clearInterval(pingInterval);
			conversationContexts.delete(connectionId);
		});

		// Handle WebSocket errors
		server.addEventListener('error', (error) => {
			console.error('[WebSocket] Connection error:', error);
			clearInterval(pingInterval);
			conversationContexts.delete(connectionId);
		});

		// Return the client WebSocket
		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	} catch (error) {
		console.error('[WebSocket] Setup error:', error);
		return new Response('WebSocket setup failed', { status: 500 });
	}
}

async function handleScreenData(payload, context, server, env) {
	try {
		console.log('[Screen Share] Processing screen data');

		if (!env.OPENAI_API_KEY) {
			console.error('[OpenAI] API key not configured');
			throw new Error('OpenAI API key not configured. Please set the OPENAI_API_KEY secret.');
		}

		const imageData = payload.data;
		if (!imageData) {
			console.error('[Screen Share] No image data received');
			throw new Error('No image data received');
		}

		console.log('[Screen Share] Sending request to OpenAI');

		// Log first few characters of API key (safely)
		const apiKeyPreview = env.OPENAI_API_KEY
			? `${env.OPENAI_API_KEY.substring(0, 4)}...${env.OPENAI_API_KEY.substring(env.OPENAI_API_KEY.length - 4)}`
			: 'not set';
		console.log('[OpenAI] Using API key:', apiKeyPreview);

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'gpt-4o-realtime-preview-2024-12-17',
				messages: [
					{
						role: 'user',
						content: [
							{
								type: 'text',
								text: 'Describe what you see in this screen capture and identify any potential issues or areas where assistance might be needed.',
							},
							{
								type: 'image_url',
								image_url: {
									url: `data:image/jpeg;base64,${imageData}`,
								},
							},
						],
					},
				],
				max_tokens: 500,
			}),
		});

		if (!response.ok) {
			const errorData = await response.text();
			console.error('[OpenAI] Error response status:', response.status);
			console.error('[OpenAI] Error response headers:', Object.fromEntries(response.headers.entries()));
			console.error('[OpenAI] Error response body:', errorData);
			throw new Error(`GPT API error: ${response.status} - ${errorData}`);
		}

		const result = await response.json();
		console.log('[OpenAI] Response received successfully');
		const screenDescription = result.choices[0].message.content;
		context.lastScreenDescription = screenDescription;

		// Send the analysis back to the client
		server.send(
			JSON.stringify({
				type: 'gpt_response',
				payload: {
					content: screenDescription,
					timestamp: Date.now(),
				},
				messageId: crypto.randomUUID(),
			})
		);
	} catch (error) {
		console.error('[Screen Share] Error processing screen data:', error);
		console.error('[Screen Share] Error stack:', error.stack);
		server.send(
			JSON.stringify({
				type: 'error',
				payload: {
					content: 'Failed to process screen data: ' + error.message,
					timestamp: Date.now(),
				},
				messageId: 'error',
			})
		);
	}
}

async function handleVoiceData(payload, context, server, env) {
	try {
		console.log('[Voice] Processing voice data');
		const audioData = payload.data;

		if (!env.OPENAI_API_KEY) {
			console.error('[OpenAI] API key not configured');
			throw new Error('OpenAI API key not configured. Please set the OPENAI_API_KEY secret.');
		}

		// Get the MIME type from the base64 data
		const mimeType = audioData.split(';')[0].split(':')[1];
		console.log('[Voice] Audio MIME type:', mimeType);

		// Convert base64 to blob with correct MIME type
		const audioBlob = await fetch(`data:${mimeType};base64,${audioData}`).then((r) => r.blob());

		// Create form data for Whisper API
		const formData = new FormData();
		formData.append('file', audioBlob, `audio.${mimeType.split('/')[1].split(';')[0]}`);
		formData.append('model', 'whisper-1');
		formData.append('response_format', 'json');
		formData.append('language', 'en');

		console.log('[Voice] Sending request to Whisper API');
		const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
				// Don't set Content-Type header, let the browser set it with the boundary
			},
			body: formData,
		});

		if (!transcriptionResponse.ok) {
			const errorData = await transcriptionResponse.text();
			console.error('[Whisper] Error response status:', transcriptionResponse.status);
			console.error('[Whisper] Error response headers:', Object.fromEntries(transcriptionResponse.headers.entries()));
			console.error('[Whisper] Error response body:', errorData);
			throw new Error(`Whisper API error: ${transcriptionResponse.status} - ${errorData}`);
		}

		const result = await transcriptionResponse.json();
		console.log('[Whisper] Transcription received:', result.text);
		context.lastTranscription = result.text;

		// Send transcription back to client
		server.send(
			JSON.stringify({
				type: 'transcription',
				payload: {
					content: result.text,
					timestamp: Date.now(),
				},
				messageId: crypto.randomUUID(),
			})
		);

		// Process transcription with GPT
		await handleChatMessage(result.text, context, server, env);
	} catch (error) {
		console.error('[Voice] Error processing voice data:', error);
		console.error('[Voice] Error stack:', error.stack);
		server.send(
			JSON.stringify({
				type: 'error',
				payload: {
					content: 'Failed to process voice data: ' + error.message,
					timestamp: Date.now(),
				},
				messageId: 'error',
			})
		);
	}
}

async function handleChatMessage(message, context, server, env) {
	try {
		console.log('[Chat] Processing message:', message);

		// Build conversation context
		const messages = [
			{
				role: 'system',
				content: `You are a helpful AI assistant. ${
					context.lastScreenDescription ? "You can see the user's screen and provide specific assistance based on what you observe." : ''
				}`,
			},
			...context.messageHistory,
			{
				role: 'user',
				content: message,
			},
		];

		// If there's screen context, add it
		if (context.lastScreenDescription) {
			messages.push({
				role: 'assistant',
				content: `Based on your screen, I can see: ${context.lastScreenDescription}`,
			});
		}

		const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'gpt-4-turbo',
				messages,
				stream: true,
			}),
		});

		if (!openAIResponse.ok) {
			throw new Error(`GPT API error: ${openAIResponse.status}`);
		}

		const reader = openAIResponse.body.getReader();
		const decoder = new TextDecoder();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value);
			server.send(
				JSON.stringify({
					type: 'gpt_response',
					payload: {
						content: chunk,
						timestamp: Date.now(),
					},
					messageId: crypto.randomUUID(),
				})
			);
		}

		// Update conversation history
		context.messageHistory.push({ role: 'user', content: message }, { role: 'assistant', content: 'Response sent in chunks' });

		// Keep history limited to last 10 messages
		if (context.messageHistory.length > 10) {
			context.messageHistory = context.messageHistory.slice(-10);
		}
	} catch (error) {
		console.error('[Chat] Error processing message:', error);
		server.send(
			JSON.stringify({
				type: 'error',
				payload: {
					content: 'Failed to process message: ' + error.message,
					timestamp: Date.now(),
				},
				messageId: 'error',
			})
		);
	}
}

// Handle audio transcription requests
async function handleTranscription(request, env) {
	if (request.method !== 'POST') {
		console.warn('[Transcription] Invalid method:', request.method);
		return new Response('Method not allowed', { status: 405 });
	}

	console.log('[Transcription] Processing new audio file');
	try {
		const formData = new FormData();
		const audioBlob = await request.blob();
		formData.append('file', audioBlob, 'audio.wav');
		formData.append('model', 'whisper-1');

		console.log('[Whisper] Sending request to OpenAI');
		const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
			},
			body: formData,
		});

		if (!transcriptionResponse.ok) {
			console.error('[Whisper] Error response:', transcriptionResponse.status);
			throw new Error(`Whisper API error: ${transcriptionResponse.status}`);
		}

		const result = await transcriptionResponse.json();
		console.log('[Whisper] Transcription successful:', result.text?.substring(0, 50) + '...');

		return new Response(JSON.stringify(result), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('[Transcription] Error:', error);
		return new Response(JSON.stringify({ error: error.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

// 🟢 Chat Request via HTTP (for fallback)
async function handleChatRequest(request, env) {
	const body = await request.json();
	const { message } = body;

	if (!message) {
		return new Response('Missing message parameter', { status: 400 });
	}

	const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.OPENAI_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: 'gpt-4-turbo',
			messages: [{ role: 'user', content: message }],
			stream: true,
		}),
	});

	return new Response(openAIResponse.body, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
}
