class WebSocketManager {
	constructor(url) {
		this.ws = new WebSocket(url);
		this.messageHandlers = new Map();

		this.ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			const handler = this.messageHandlers.get(data.type);
			if (handler) handler(data.content);
		};
	}

	addMessageHandler(type, handler) {
		this.messageHandlers.set(type, handler);
	}

	send(type, payload) {
		this.ws.send(JSON.stringify({ type, payload }));
	}
}

export const wsManager = new WebSocketManager('wss://your-worker.workers.dev');
