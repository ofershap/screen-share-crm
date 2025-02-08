class ScreenShareManager {
	constructor(wsManager) {
		this.wsManager = wsManager;
		this.stream = null;
		this.isSharing = false;
	}

	async startSharing() {
		try {
			// Request screen sharing permission
			this.stream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					cursor: 'always',
					frameRate: { ideal: 30 },
				},
				audio: false,
			});

			// Set up frame capture
			const videoTrack = this.stream.getVideoTracks()[0];
			const { width, height } = videoTrack.getSettings();

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');

			const videoElement = document.createElement('video');
			videoElement.srcObject = this.stream;
			videoElement.onloadedmetadata = () => videoElement.play();

			this.isSharing = true;

			// Start frame capture loop
			const captureFrame = () => {
				if (!this.isSharing) return;

				context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
				const frame = canvas.toDataURL('image/jpeg', 0.5); // Adjust quality as needed

				this.wsManager.send('screen_data', { frame });
				requestAnimationFrame(captureFrame);
			};

			captureFrame();

			// Handle stream stop
			videoTrack.onended = () => this.stopSharing();
		} catch (error) {
			console.error('Failed to start screen sharing:', error);
			throw error;
		}
	}

	stopSharing() {
		if (this.stream) {
			this.stream.getTracks().forEach((track) => track.stop());
			this.isSharing = false;
		}
	}
}
