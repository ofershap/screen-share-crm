async function handleAudioRecording(audioBlob) {
	const formData = new FormData();
	formData.append('file', audioBlob);

	const response = await fetch('https://your-worker.workers.dev?action=transcribe', {
		method: 'POST',
		body: audioBlob,
	});

	const transcription = await response.json();
	// Use the transcription
}
