export default {
	async fetch(request, env) {
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
				console.error(`[Error] Invalid action: ${action}`);
				return new Response('Invalid Request', { status: 400 });
		}
	},
};

// Maintain conversation context per connection
const conversationContexts = new Map();

// 🟢 WebSocket Handler for real-time conversation and screen sharing
async function handleWebSocket(request, env) {
	const [client, server] = Object.values(new WebSocketPair());
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
			if (server.readyState === WebSocket.OPEN) {
				const context = conversationContexts.get(connectionId);
				if (context && Date.now() - context.lastPing > 45000) {
					// No ping received for 45 seconds, close connection
					console.log('[WebSocket] No ping received, closing connection');
					server.close(1000, 'Ping timeout');
					clearInterval(pingInterval);
					conversationContexts.delete(connectionId);
					return;
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

	server.addEventListener('message', async (event) => {
		try {
			const data = JSON.parse(event.data);
			const { type, payload, messageId } = data;
			console.log(`[WebSocket] Received message type: ${type}`);

			const context = conversationContexts.get(connectionId);
			if (!context) {
				console.error('[WebSocket] No context found for connection');
				server.close(1000, 'No context found');
				return;
			}

			// Handle ping messages
			if (type === 'ping') {
				context.lastPing = Date.now();
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
					console.warn(`[WebSocket] Unknown message type: ${type}`);
					server.send(
						JSON.stringify({
							type: 'error',
							payload: {
								content: 'Unknown message type',
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

	server.addEventListener('error', (error) => {
		console.error('[WebSocket] Connection error:', error);
		clearInterval(pingInterval);
		conversationContexts.delete(connectionId);
	});

	server.addEventListener('close', () => {
		console.log('[WebSocket] Connection closed');
		clearInterval(pingInterval);
		conversationContexts.delete(connectionId);
	});

	return new Response(null, { status: 101, webSocket: client });
}

async function handleScreenData(payload, context, server, env) {
	try {
		console.log('[Screen Share] Processing screen data');
		const imageData = payload.data;

		// Analyze screen content with GPT-4 Vision
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'gpt-4-vision-preview',
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
			throw new Error(`GPT Vision API error: ${response.status}`);
		}

		const result = await response.json();
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

		// Convert base64 to blob
		const audioBlob = await fetch(`data:audio/webm;base64,${audioData}`).then((r) => r.blob());

		// Create form data for Whisper API
		const formData = new FormData();
		formData.append('file', audioBlob, 'audio.webm');
		formData.append('model', 'whisper-1');

		// Send to Whisper API
		const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
			},
			body: formData,
		});

		if (!transcriptionResponse.ok) {
			throw new Error(`Whisper API error: ${transcriptionResponse.status}`);
		}

		const result = await transcriptionResponse.json();
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
