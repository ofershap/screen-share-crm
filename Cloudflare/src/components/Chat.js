const ws = new WebSocket('wss://your-worker.workers.dev');

ws.onmessage = (event) => {
	const data = JSON.parse(event.data);
	switch (data.type) {
		case 'gpt_response':
			// Handle GPT response
			break;
		case 'screen_update':
			// Handle screen updates
			break;
		case 'error':
			// Handle errors
			break;
	}
};
