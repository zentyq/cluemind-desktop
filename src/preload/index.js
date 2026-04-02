const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cluemind', {
  // Session control
  startSession: () => ipcRenderer.invoke('START_SESSION'),
  stopSession: () => ipcRenderer.invoke('STOP_SESSION'),
  getSessionState: () => ipcRenderer.invoke('GET_SESSION_STATE'),

  // Screen capture
  captureScreen: () => ipcRenderer.invoke('CAPTURE_SCREEN'),

  // Overlay
  toggleOverlay: () => ipcRenderer.invoke('TOGGLE_OVERLAY'),
  updateMode: (mode) => ipcRenderer.invoke('UPDATE_MODE', mode),

  // AI
  getAISuggestion: (text, mode) => ipcRenderer.invoke('GET_AI_SUGGESTION', { text, mode }),
  getInterviewHelp: (question, language) => ipcRenderer.invoke('GET_INTERVIEW_HELP', { question, language }),

  // Settings
  getSettings: () => ipcRenderer.invoke('GET_SETTINGS'),
  saveSettings: (settings) => ipcRenderer.invoke('SAVE_SETTINGS', settings),
  openSettings: () => ipcRenderer.invoke('OPEN_SETTINGS'),
  testGemini: (apiKey) => ipcRenderer.invoke('TEST_GEMINI', apiKey),
  testDeepgram: (apiKey) => ipcRenderer.invoke('TEST_DEEPGRAM', apiKey),

  // Audio data from renderer mic capture
  sendAudioData: (chunk) => ipcRenderer.send('SEND_AUDIO_DATA', chunk),

  // Chat - ask question about screen capture
  askAboutScreen: (question) => ipcRenderer.invoke('ASK_ABOUT_SCREEN', question),

  // Window control
  closeWindow: () => ipcRenderer.invoke('CLOSE_WINDOW'),
  minimizeWindow: () => ipcRenderer.invoke('MINIMIZE_WINDOW'),

  // Event listeners
  onTranscriptUpdate: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('TRANSCRIPT_UPDATE', handler)
    return () => ipcRenderer.removeListener('TRANSCRIPT_UPDATE', handler)
  },
  onAISuggestion: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('AI_SUGGESTION', handler)
    return () => ipcRenderer.removeListener('AI_SUGGESTION', handler)
  },
  onToggleSession: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('TOGGLE_SESSION', handler)
    return () => ipcRenderer.removeListener('TOGGLE_SESSION', handler)
  }
})
