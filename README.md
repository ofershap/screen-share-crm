# Screen Share + GPT Chat Application

## Project Goal

Build a web application that enables users to:

1. Share their screen with GPT
2. Have real-time voice conversations with GPT
3. Get AI assistance based on what's happening on their screen
4. Maintain a continuous conversation context

## Current Architecture

### Web (Frontend)

- React application using TypeScript
- Uses custom hooks for WebSocket and MediaDevices
- Implements screen capture and voice recording
- Modern UI with Tailwind CSS

### Cloudflare (Backend)

- Worker handling WebSocket connections
- Processes screen share data
- Manages OpenAI API interactions
- Handles voice transcription via Whisper API

## Implementation Status

### 1. Screen Sharing ✅

- [x] Screen capture implementation
- [x] Base64 encoding of screen data
- [x] WebSocket transmission
- [x] GPT-4 Vision integration
- [x] Real-time screen analysis

### 2. Voice Integration ✅

- [x] Voice recording implementation
- [x] WebSocket-based transmission
- [x] Whisper API integration
- [x] Real-time transcription
- [x] Voice context integration

### 3. WebSocket Communication ✅

- [x] Standardized message format
- [x] Binary data handling
- [x] Message acknowledgment system
- [x] Error handling and recovery
- [x] Connection management

### 4. Conversation Context ✅

- [x] Message history management
- [x] Screen context integration
- [x] Voice context integration
- [x] Context pruning (10 message limit)

## Message Format Specification

### Frontend to Backend:

```typescript
interface ClientMessage {
  type: "screen_data" | "voice_data" | "chat";
  payload: {
    data?: string; // base64 encoded for screen/voice
    message?: string; // for chat messages
    timestamp: number;
  };
  messageId: string; // for acknowledgment
}
```

### Backend to Frontend:

```typescript
interface ServerMessage {
  type: "gpt_response" | "transcription" | "error" | "ack";
  payload: {
    content: string;
    timestamp: number;
  };
  messageId: string; // reference to original message
}
```

## Setup Instructions

1. Frontend Setup:

```bash
cd Web
npm install
npm run dev
```

2. Backend Setup:

```bash
cd Cloudflare
npm install
wrangler dev
```

3. Environment Variables:

```env
OPENAI_API_KEY=your_api_key_here
```

## Testing Instructions

1. **WebSocket Connection**

   - Open the application
   - Check browser console for connection logs
   - Verify "Connected" status in UI

2. **Screen Sharing**

   - Click "Share Your Screen"
   - Allow browser permissions
   - Verify screen preview
   - Check for GPT responses about screen content

3. **Voice Chat**

   - Click "Add Voice Feedback"
   - Allow microphone permissions
   - Speak and verify transcription appears
   - Check for GPT responses

4. **Error Handling**
   - Test with invalid API key
   - Test with network disconnection
   - Test with denied permissions
   - Verify error messages in UI

## Monitoring

Use `wrangler tail` to monitor the Worker:

```bash
wrangler tail your-worker-name --format pretty
```

Look for these log categories:

- `[WebSocket]` - Connection events
- `[Screen]` - Screen sharing events
- `[Voice]` - Voice processing events
- `[Chat]` - Message processing
- `[Error]` - Error events

## Known Limitations

1. Screen capture frequency limited to every 2 seconds to manage bandwidth
2. Voice data chunked into 2-second segments
3. Conversation history limited to last 10 messages
4. Maximum screen resolution of 1920x1080

## Next Steps

1. Add rate limiting
2. Implement user authentication
3. Add screen recording history
4. Implement voice commands
5. Add support for multiple screens
6. Optimize data transmission
