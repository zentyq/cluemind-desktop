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
  askNow: () => ipcRenderer.invoke('ASK_NOW'),
  getUsage: () => ipcRenderer.invoke('GET_USAGE'),
  recapSession: () => ipcRenderer.invoke('RECAP_SESSION'),
  startMock: () => ipcRenderer.invoke('START_MOCK'),
  getProfile: () => ipcRenderer.invoke('GET_PROFILE'),
  saveProfile: (body) => ipcRenderer.invoke('SAVE_PROFILE', body),
  getPlaybooks: () => ipcRenderer.invoke('GET_PLAYBOOKS'),
  addPlaybook: (body) => ipcRenderer.invoke('ADD_PLAYBOOK', body),
  setOverlayOpacity: (value) => ipcRenderer.invoke('SET_OVERLAY_OPACITY', value),
  setClickThrough: (on) => ipcRenderer.invoke('SET_CLICK_THROUGH', on),
  sendBrowserTranscript: (data) => ipcRenderer.send('BROWSER_TRANSCRIPT', data),

  // Settings
  getSettings: () => ipcRenderer.invoke('GET_SETTINGS'),
  saveSettings: (settings) => ipcRenderer.invoke('SAVE_SETTINGS', settings),
  openSettings: () => ipcRenderer.invoke('OPEN_SETTINGS'),
  checkForUpdates: () => ipcRenderer.invoke('CHECK_FOR_UPDATES'),
  testAI: (provider, apiKey) => ipcRenderer.invoke('TEST_AI', { provider, apiKey }),
  testDeepgram: (apiKey) => ipcRenderer.invoke('TEST_DEEPGRAM', apiKey),

  // Cloud auth / SaaS
  getAuth: () => ipcRenderer.invoke('GET_AUTH'),
  cloudLogin: (payload) => ipcRenderer.invoke('CLOUD_LOGIN', payload),
  cloudRegister: (payload) => ipcRenderer.invoke('CLOUD_REGISTER', payload),
  cloudLogout: () => ipcRenderer.invoke('CLOUD_LOGOUT'),
  cloudLoginToken: (token) => ipcRenderer.invoke('CLOUD_LOGIN_TOKEN', token),
  openLogin: (opts) => ipcRenderer.invoke('OPEN_LOGIN', opts || {}),
  closeLogin: () => ipcRenderer.invoke('CLOSE_LOGIN'),
  quitApp: () => ipcRenderer.invoke('QUIT_APP'),
  minimizeLogin: () => ipcRenderer.invoke('MINIMIZE_LOGIN'),
  openExternal: (url) => ipcRenderer.invoke('OPEN_EXTERNAL', url),

  // License activation (mandatory)
  activateLicense: (key) => ipcRenderer.invoke('ACTIVATE_LICENSE', key),
  getLicenseStatus: () => ipcRenderer.invoke('GET_LICENSE_STATUS'),
  clearLicense: () => ipcRenderer.invoke('CLEAR_LICENSE'),

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
  },
  onMicStatus: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('MIC_STATUS', handler)
    return () => ipcRenderer.removeListener('MIC_STATUS', handler)
  },
  onAuthChanged: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('AUTH_CHANGED', handler)
    return () => ipcRenderer.removeListener('AUTH_CHANGED', handler)
  },
  onUsageUpdate: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('USAGE_UPDATE', handler)
    return () => ipcRenderer.removeListener('USAGE_UPDATE', handler)
  },
  onHotkey: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('HOTKEY', handler)
    return () => ipcRenderer.removeListener('HOTKEY', handler)
  },
  onStartBrowserStt: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('START_BROWSER_STT', handler)
    return () => ipcRenderer.removeListener('START_BROWSER_STT', handler)
  },
  onStopBrowserStt: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('STOP_BROWSER_STT', handler)
    return () => ipcRenderer.removeListener('STOP_BROWSER_STT', handler)
  }
})
