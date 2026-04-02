# ClueMind AI Assistant

Real-time AI assistant for meetings, interviews, and screen analysis — a desktop companion built with Electron.

## Features

- **Real-Time Transcription** — Live audio transcription via Deepgram WebSocket API
- **AI-Powered Suggestions** — Context-aware suggestions powered by Google Gemini (gemini-2.0-flash)
- **Screen Analysis** — Capture and analyze your screen with AI vision
- **Interview Mode** — Detect coding questions and provide solutions with complexity analysis
- **Invisible Overlay** — Always-on-top overlay that's invisible during screen sharing
- **System Tray** — Quick access from the system tray with keyboard shortcuts

## Prerequisites

- **Node.js** 18+ and npm
- **SoX** (Sound eXchange) for audio capture:
  - **Windows**: Download from [sourceforge.net/projects/sox](https://sourceforge.net/projects/sox/) and add to PATH
  - **macOS**: `brew install sox`
  - **Linux**: `sudo apt install sox libsox-fmt-all`

## API Keys Required

1. **Google Gemini API Key** — Get from [aistudio.google.com](https://aistudio.google.com/app/apikey)
2. **Deepgram API Key** — Get from [console.deepgram.com](https://console.deepgram.com/)

## Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Usage

1. Launch the app — the overlay will appear in the top-right corner
2. Open **Settings** (gear icon or tray menu) and enter your API keys
3. Click **Test** to verify both API connections
4. Choose your mode:
   - **Meeting** — Get meeting summaries and action items
   - **Interview** — Get coding help with strategy, code, and complexity
   - **Screen** — Analyze what's on your screen
5. Click **Start** to begin transcription
6. Click **Capture** to take a screenshot for AI analysis

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+A` (Win/Linux) | Toggle overlay visibility |
| `Cmd+Shift+A` (Mac) | Toggle overlay visibility |

## Architecture

```
src/
├── main/              Main process (Electron)
│   ├── index.js       App entry, window management, shortcuts
│   ├── overlay.js     Overlay window creation and management
│   ├── tray.js        System tray icon and menu
│   └── ipc-handlers.js IPC message handlers
├── preload/
│   └── index.js       Context bridge (secure IPC)
├── renderer/
│   ├── overlay/       Overlay UI (HTML/CSS/JS)
│   └── settings/      Settings window (HTML/CSS/JS)
└── utils/
    ├── ai.js          Gemini API integration
    ├── audio.js       Deepgram + mic capture
    └── screen.js      Screen capture via desktopCapturer
```

## Privacy & Security

- API keys are stored locally using `electron-store` with encryption
- The overlay uses `setContentProtection(true)` — it is **invisible** during screen sharing
- No data is sent to any server other than the configured AI APIs
- All communication uses secure WebSocket (wss://) and HTTPS

## License

MIT
