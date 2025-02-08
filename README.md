# Screen Share GPT

A real-time screen sharing and voice chat application with GPT-4 Vision integration, enabling AI-powered assistance based on what's happening on your screen.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4%20Vision-green.svg)
![Platform](https://img.shields.io/badge/platform-Cloudflare%20Workers-orange.svg)

## 🌟 Features

- 🖥️ Real-time screen sharing with GPT-4 Vision analysis
- 🎙️ Voice chat with Whisper transcription
- 💬 Contextual AI responses based on screen content
- ⚡ Low-latency WebSocket communication
- 🎨 Modern, responsive UI with Tailwind CSS
- 🔒 Secure, serverless architecture on Cloudflare Workers

## 🏗️ Architecture

### Frontend (Web)

- **Framework**: React + TypeScript
- **Styling**: Tailwind CSS
- **Media**: WebRTC for screen capture and voice recording
- **State Management**: React hooks
- **Communication**: WebSocket for real-time data transfer

### Backend (Cloudflare Workers)

- **Runtime**: Cloudflare Workers (Edge Computing)
- **Protocol**: WebSocket + REST APIs
- **AI Integration**:
  - Vision: gpt-4o-realtime-preview-2024-12-17
  - Voice: whisper-1
  - Chat: gpt-4o-mini-realtime-preview

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Cloudflare Workers account
- OpenAI API key

### Frontend Setup

```bash
# Clone the repository
git clone https://github.com/ofershap/screen-share-gpt.git
cd screen-share-gpt

# Install frontend dependencies
cd Web
npm install

# Start development server
npm run dev
```

### Backend Setup

```bash
# Install backend dependencies
cd Cloudflare
npm install

# Configure Cloudflare Worker
# Create wrangler.json with the following content:
{
  "name": "screen-share-gpt",
  "main": "src/index.js",
  "compatibility_date": "2024-02-08",
  "compatibility_flags": ["nodejs_compat"]
}

# Start development worker
npm run dev
```

### Environment Variables

Create the var in your Cloudflare directory:

```env
OPENAI_API_KEY=your_api_key_here
```

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Development Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow React hooks best practices
- Implement proper error handling
- Add appropriate comments and documentation
- Follow the existing project structure

### Testing

1. **Frontend Tests**

   ```bash
   cd Web
   npm run test
   ```

2. **Backend Tests**
   ```bash
   cd Cloudflare
   npm run test
   ```

### Documentation

- Update README.md for major changes
- Document new features and APIs
- Include JSDoc comments for functions
- Update type definitions

## 📝 API Documentation

### WebSocket Message Format

#### Client to Server:

```typescript
interface ClientMessage {
  type: "screen_data" | "voice_data" | "chat";
  payload: {
    data?: string; // base64 encoded for screen/voice
    message?: string; // for chat messages
    timestamp: number;
  };
  messageId: string;
}
```

#### Server to Client:

```typescript
interface ServerMessage {
  type: "gpt_response" | "transcription" | "error" | "ack";
  payload: {
    content: string;
    timestamp: number;
  };
  messageId: string;
}
```

## 🔍 Monitoring and Debugging

### Development Logs

```bash
# Watch worker logs
wrangler tail screen-share-gpt --format pretty
# or
npm start # will deploy and start the log tailing

# Frontend development logs
npm run dev
```

### Log Categories

- `[WebSocket]` - Connection events
- `[Screen]` - Screen sharing events
- `[Voice]` - Voice processing events
- `[Chat]` - Message processing
- `[Error]` - Error events

## ⚠️ Known Limitations

1. Screen capture frequency: 2-second intervals (bandwidth management)
2. Voice data: 2-second chunks
3. Conversation history: Limited to last 10 messages
4. Maximum screen resolution: 1920x1080
5. Browser support: Modern browsers only (Chrome, Firefox, Edge)

## 🗺️ Roadmap

- [ ] Make it work, fix worker code
- [ ] User authentication and session management
- [ ] Rate limiting and usage quotas
- [ ] Screen recording history
- [ ] Voice commands
- [ ] Multiple screen support
- [ ] Data transmission optimization
- [ ] Mobile device support
- [ ] Collaborative sessions

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenAI for GPT-4 Vision and Whisper APIs
- Cloudflare for Workers platform
- React and TypeScript communities
- All contributors and users

## 💬 Support

- Create an issue for bug reports
- Star the repository if you find it useful
- Fork and contribute to help improve the project

---

Made with ❤️ by the Screen Share GPT team
