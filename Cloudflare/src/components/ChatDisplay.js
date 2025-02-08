class ChatDisplay {
	constructor(wsManager) {
		this.wsManager = wsManager;

		// Set up WebSocket message handlers
		this.wsManager.addMessageHandler('gpt_response', (content) => {
			this.handleGPTResponse(content);
		});
	}

	handleGPTResponse(content) {
		try {
			// Parse the SSE data
			const lines = content.split('\n');
			let message = '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = JSON.parse(line.slice(6));
					if (data.choices?.[0]?.delta?.content) {
						message += data.choices[0].delta.content;
						this.updateUI(message); // Implement this method to update your UI
					}
				}
			}
		} catch (error) {
			console.error('Error processing GPT response:', error);
		}
	}
}
