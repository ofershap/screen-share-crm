export default {
	async fetch(request, env) {
		try {
			console.log(`[Request] ${request.method} ${request.url}`);

			if (request.headers.get('Upgrade') === 'websocket') {
				console.log('[WebSocket] New connection request');
				return handleWebSocket(request, env);
			}

			// Simple health check endpoint
			return new Response('OK');
		} catch (error) {
			console.error('[Error]', error);
			return new Response('Internal Server Error', { status: 500 });
		}
	},
};

// Maintain conversation context per connection
const conversationContexts = new Map();

// WebSocket Handler for voice + screen analysis
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
			lastScreenData: null,
			lastVoiceData: null,
			lastAnalysis: null,
			lastPing: Date.now(),
			pendingAnalysis: false,
		});

		// Set up ping interval to keep connection alive
		const pingInterval = setInterval(() => {
			try {
				if (server.readyState === 1) {
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
						context.lastScreenData = payload.data;
						if (context.lastVoiceData && !context.pendingAnalysis) {
							await handleAnalysis(context, server, env);
						}
						break;
					case 'voice_data':
						context.lastVoiceData = payload.data;
						if (context.lastScreenData && !context.pendingAnalysis) {
							await handleAnalysis(context, server, env);
						}
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

function validateApiKey(env) {
	if (!env.OPENAI_API_KEY) {
		console.error('[OpenAI] API key not configured');
		throw new Error('OpenAI API key not configured. Please set the OPENAI_API_KEY secret.');
	}

	if (!env.OPENAI_API_KEY.startsWith('sk-')) {
		console.error('[OpenAI] Invalid API key format');
		throw new Error('Invalid OpenAI API key format. Key should start with "sk-"');
	}

	const apiKeyPreview = `${env.OPENAI_API_KEY.substring(0, 4)}...${env.OPENAI_API_KEY.substring(env.OPENAI_API_KEY.length - 4)}`;
	console.log('[OpenAI] Using API key:', apiKeyPreview);
}

async function handleAnalysis(context, server, env) {
	try {
		console.log('[Analysis] Processing voice and screen data');
		validateApiKey(env);
		context.pendingAnalysis = true;

		// 1. Process voice data with Whisper
		const audioBlob = await fetch(context.lastVoiceData).then((r) => r.blob());
		const mimeType = audioBlob.type.split(';')[0];
		const finalBlob = new Blob([await audioBlob.arrayBuffer()], { type: mimeType });

		const formData = new FormData();
		formData.append('file', finalBlob, 'audio.webm');
		formData.append('model', 'whisper-1');
		formData.append('response_format', 'json');
		formData.append('language', 'en');

		const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
			method: 'POST',
			headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
			body: formData,
		});

		if (!transcriptionResponse.ok) {
			throw new Error(`Whisper API error: ${transcriptionResponse.status}`);
		}

		const transcriptionResult = await transcriptionResponse.json();
		const transcription = transcriptionResult.text;

		// Send transcription to client
		server.send(
			JSON.stringify({
				type: 'transcription',
				payload: {
					content: transcription,
					timestamp: Date.now(),
				},
				messageId: crypto.randomUUID(),
			})
		);

		// 2. Process screen data with GPT-4 Vision
		const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'gpt-4o-realtime-preview-2024-12-17',
				messages: [
					{
						role: 'system',
						content:
							'You are a helpful AI assistant that can see and analyze screen content. Provide specific assistance based on what you observe.',
					},
					{
						role: 'user',
						content: [
							{ type: 'text', text: transcription },
							{ type: 'image_url', image_url: { url: context.lastScreenData } },
						],
					},
				],
				max_tokens: 300,
				temperature: 0.7,
			}),
		});

		if (!visionResponse.ok) {
			throw new Error(`Vision API error: ${visionResponse.status}`);
		}

		const visionResult = await visionResponse.json();
		const analysis = visionResult.choices[0].message.content;

		// 3. Generate voice response using GPT-4 Mini
		const chatResponse = await fetch('https://api.openai.com/v1/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'gpt-4o-mini-realtime-preview',
				prompt: `You are a helpful AI assistant. Based on the user's voice input: "${transcription}" and screen analysis: "${analysis}", provide a concise and helpful response.`,
				max_tokens: 500,
				temperature: 0.7,
			}),
		});

		if (!chatResponse.ok) {
			throw new Error(`GPT API error: ${chatResponse.status}`);
		}

		const chatResult = await chatResponse.json();
		const response = chatResult.choices[0].text;

		// Send response to client
		server.send(
			JSON.stringify({
				type: 'gpt_response',
				payload: {
					content: response,
					timestamp: Date.now(),
				},
				messageId: crypto.randomUUID(),
			})
		);

		// Keep history limited to last 10 interactions
		context.messageHistory.push({
			input: { transcription, screenAnalysis: analysis },
			response,
			timestamp: Date.now(),
		});

		if (context.messageHistory.length > 10) {
			context.messageHistory = context.messageHistory.slice(-10);
		}

		// Reset state for next analysis
		context.lastVoiceData = null;
		context.lastScreenData = null;
		context.pendingAnalysis = false;
	} catch (error) {
		console.error('[Analysis] Error:', error);
		server.send(
			JSON.stringify({
				type: 'error',
				payload: { content: 'Failed to process data: ' + error.message, timestamp: Date.now() },
				messageId: 'error',
			})
		);
		context.pendingAnalysis = false;
	}
}

async function handleChatMessage(message, context, server, env) {
	try {
		console.log('[Chat] Processing message:', message);
		validateApiKey(env);

		const chatResponse = await fetch('https://api.openai.com/v1/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: 'gpt-4o-mini-realtime-preview',
				prompt: `You are a helpful AI assistant. The user says: "${message}". Provide a concise and helpful response.`,
				max_tokens: 500,
				temperature: 0.7,
			}),
		});

		if (!chatResponse.ok) {
			throw new Error(`GPT API error: ${chatResponse.status}`);
		}

		const chatResult = await chatResponse.json();
		const response = chatResult.choices[0].text;

		server.send(
			JSON.stringify({
				type: 'gpt_response',
				payload: {
					content: response,
					timestamp: Date.now(),
				},
				messageId: crypto.randomUUID(),
			})
		);

		context.messageHistory.push({
			input: { message },
			response,
			timestamp: Date.now(),
		});

		if (context.messageHistory.length > 10) {
			context.messageHistory = context.messageHistory.slice(-10);
		}
	} catch (error) {
		console.error('[Chat] Error:', error);
		server.send(
			JSON.stringify({
				type: 'error',
				payload: { content: 'Failed to process message: ' + error.message, timestamp: Date.now() },
				messageId: 'error',
			})
		);
	}
}
