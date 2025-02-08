class VoiceRecorder {
	constructor() {
		this.mediaRecorder = null;
		this.audioChunks = [];
	}

	async startRecording() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			this.mediaRecorder = new MediaRecorder(stream);

			this.mediaRecorder.ondataavailable = (event) => {
				this.audioChunks.push(event.data);
			};

			this.mediaRecorder.onstop = async () => {
				const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
				await this.transcribeAudio(audioBlob);
				this.audioChunks = [];
			};

			this.mediaRecorder.start();
		} catch (error) {
			console.error('Failed to start recording:', error);
			throw error;
		}
	}

	stopRecording() {
		if (this.mediaRecorder) {
			this.mediaRecorder.stop();
		}
	}

	async transcribeAudio(audioBlob) {
		try {
			const response = await fetch('https://your-worker.workers.dev?action=transcribe', {
				method: 'POST',
				body: audioBlob,
			});

			const transcription = await response.json();
			return transcription;
		} catch (error) {
			console.error('Transcription failed:', error);
			throw error;
		}
	}
}
