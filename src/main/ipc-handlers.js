import { ipcMain, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { getOverlayWindow, toggleOverlay } from './overlay'
import { getAISuggestion, analyzeScreen, getInterviewHelp, askAboutScreen } from '../utils/ai'
import { startAudioCapture, stopAudioCapture, sendAudioChunk } from '../utils/audio'
import { captureScreen } from '../utils/screen'
import { startMicCapture, stopMicCapture } from './mic-window'

const store = new Store({
  encryptionKey: 'cluemind-secure-key-v1',
  schema: {
    geminiApiKey: { type: 'string', default: '' },
    deepgramApiKey: { type: 'string', default: '' },
    defaultMode: { type: 'string', default: 'meeting' },
    interviewLanguage: { type: 'string', default: 'javascript' }
  }
})

/**
 * Register all IPC handlers for main process communication
 * @param {object} sessionState - The application session state
 * @param {Function} createSettingsWindow - Function to open settings
 */
function registerIpcHandlers(sessionState, createSettingsWindow) {
  ipcMain.handle('GET_SETTINGS', () => {
    return {
      geminiApiKey: store.get('geminiApiKey', ''),
      deepgramApiKey: store.get('deepgramApiKey', ''),
      defaultMode: store.get('defaultMode', 'meeting'),
      interviewLanguage: store.get('interviewLanguage', 'javascript')
    }
  })

  ipcMain.handle('SAVE_SETTINGS', (_event, settings) => {
    if (settings.geminiApiKey !== undefined) store.set('geminiApiKey', settings.geminiApiKey)
    if (settings.deepgramApiKey !== undefined) store.set('deepgramApiKey', settings.deepgramApiKey)
    if (settings.defaultMode !== undefined) store.set('defaultMode', settings.defaultMode)
    if (settings.interviewLanguage !== undefined) store.set('interviewLanguage', settings.interviewLanguage)
    return { success: true }
  })

  ipcMain.handle('START_SESSION', () => {
    console.log('IPC: START_SESSION received')
    const deepgramApiKey = store.get('deepgramApiKey', '')
    if (!deepgramApiKey) {
      console.log('No Deepgram API key set')
      return { success: false, error: 'Deepgram API key not set. Open Settings to add it.' }
    }
    console.log('Deepgram key present, length:', deepgramApiKey.length)

    sessionState.isActive = true
    sessionState.startTime = Date.now()
    sessionState.transcript = []
    sessionState.suggestions = []

    const overlay = getOverlayWindow()

    try {
      startAudioCapture(deepgramApiKey, (transcript) => {
        sessionState.transcript.push(transcript)
        if (overlay && !overlay.isDestroyed()) {
          overlay.webContents.send('TRANSCRIPT_UPDATE', transcript)
        }

        // Auto-generate AI suggestion on final transcripts
        if (transcript.isFinal) {
          const geminiApiKey = store.get('geminiApiKey', '')
          if (geminiApiKey) {
            const recentTranscript = sessionState.transcript
              .filter(t => t.isFinal)
              .slice(-20)
              .map(t => t.text)
              .join(' ')

            getAISuggestion(recentTranscript, sessionState.mode, geminiApiKey)
              .then(suggestion => {
                if (suggestion && overlay && !overlay.isDestroyed()) {
                  sessionState.suggestions.push(suggestion)
                  overlay.webContents.send('AI_SUGGESTION', suggestion)
                }
              })
              .catch(err => console.error('AI suggestion error:', err))
          }
        }
      })

      // Start mic capture in hidden window
      startMicCapture()

      return { success: true }
    } catch (err) {
      sessionState.isActive = false
      return { success: false, error: err.message }
    }
  })

  ipcMain.on('SEND_AUDIO_DATA', (_event, chunk) => {
    if (sessionState.isActive) {
      const buf = Buffer.from(chunk)
      if (Math.random() < 0.01) console.log('Audio chunk received, size:', buf.byteLength)
      if (buf.byteLength > 0) {
        sendAudioChunk(buf)
      }
    }
  })

  ipcMain.on('MIC_READY', () => {
    console.log('Mic capture ready — audio flowing')
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('MIC_STATUS', { ready: true })
    }
  })

  ipcMain.on('MIC_ERROR', (_event, msg) => {
    console.error('Mic capture error:', msg)
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('MIC_STATUS', { ready: false, error: msg })
    }
  })

  ipcMain.handle('STOP_SESSION', () => {
    sessionState.isActive = false
    stopAudioCapture()
    stopMicCapture()

    // Save transcript to store
    const transcriptText = sessionState.transcript
      .filter(t => t.isFinal)
      .map(t => t.text)
      .join(' ')

    if (transcriptText) {
      const sessions = store.get('pastSessions', [])
      sessions.push({
        date: new Date().toISOString(),
        mode: sessionState.mode,
        duration: Date.now() - sessionState.startTime,
        transcript: transcriptText
      })
      // Keep last 50 sessions
      if (sessions.length > 50) sessions.splice(0, sessions.length - 50)
      store.set('pastSessions', sessions)
    }

    return { success: true }
  })

  ipcMain.handle('CAPTURE_SCREEN', async () => {
    const geminiApiKey = store.get('geminiApiKey', '')
    if (!geminiApiKey) {
      return { success: false, error: 'Gemini API key not set. Open Settings to add it.' }
    }

    try {
      const base64Image = await captureScreen()
      sessionState.lastScreenCapture = base64Image
      const analysis = await analyzeScreen(base64Image, geminiApiKey)

      const overlay = getOverlayWindow()
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('AI_SUGGESTION', {
          ...analysis,
          type: 'screen-analysis'
        })
      }

      return { success: true, analysis }
    } catch (err) {
      console.error('Screen capture error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('ASK_ABOUT_SCREEN', async (_event, question) => {
    const geminiApiKey = store.get('geminiApiKey', '')
    if (!geminiApiKey) {
      return { success: false, error: 'Gemini API key not set.' }
    }
    if (!sessionState.lastScreenCapture) {
      return { success: false, error: 'No screen capture yet. Click Capture first.' }
    }

    try {
      const answer = await askAboutScreen(sessionState.lastScreenCapture, question, geminiApiKey)
      const overlay = getOverlayWindow()
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('AI_SUGGESTION', answer)
      }
      return { success: true, answer }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('TOGGLE_OVERLAY', () => {
    toggleOverlay()
    return { success: true }
  })

  ipcMain.handle('UPDATE_MODE', (_event, mode) => {
    sessionState.mode = mode
    return { success: true }
  })

  ipcMain.handle('GET_AI_SUGGESTION', async (_event, { text, mode }) => {
    const geminiApiKey = store.get('geminiApiKey', '')
    if (!geminiApiKey) {
      return { success: false, error: 'Gemini API key not set.' }
    }

    try {
      const suggestion = await getAISuggestion(text, mode || sessionState.mode, geminiApiKey)
      return { success: true, suggestion }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('GET_INTERVIEW_HELP', async (_event, { question, language }) => {
    const geminiApiKey = store.get('geminiApiKey', '')
    if (!geminiApiKey) {
      return { success: false, error: 'Gemini API key not set.' }
    }

    try {
      const help = await getInterviewHelp(
        question,
        language || store.get('interviewLanguage', 'javascript'),
        geminiApiKey
      )
      return { success: true, help }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('OPEN_SETTINGS', () => {
    createSettingsWindow()
    return { success: true }
  })

  ipcMain.handle('GET_SESSION_STATE', () => {
    return {
      isActive: sessionState.isActive,
      mode: sessionState.mode,
      startTime: sessionState.startTime,
      overlayVisible: sessionState.overlayVisible,
      transcriptCount: sessionState.transcript.length,
      suggestionsCount: sessionState.suggestions.length
    }
  })

  ipcMain.handle('TEST_GEMINI', async (_event, apiKey) => {
    try {
      const result = await getAISuggestion('Hello, respond with OK if you can hear me.', 'meeting', apiKey)
      return { success: true, message: 'Gemini API connected successfully.' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('TEST_DEEPGRAM', async (_event, apiKey) => {
    try {
      const WebSocket = (await import('ws')).default
      return new Promise((resolve) => {
        const ws = new WebSocket('wss://api.deepgram.com/v1/listen', {
          headers: { Authorization: `Token ${apiKey}` }
        })
        const timeout = setTimeout(() => {
          ws.close()
          resolve({ success: false, error: 'Connection timed out.' })
        }, 5000)
        ws.on('open', () => {
          clearTimeout(timeout)
          ws.close()
          resolve({ success: true, message: 'Deepgram API connected successfully.' })
        })
        ws.on('error', (err) => {
          clearTimeout(timeout)
          resolve({ success: false, error: `Connection failed: ${err.message}` })
        })
      })
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('CLOSE_WINDOW', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.hide()
    return { success: true }
  })

  ipcMain.handle('MINIMIZE_WINDOW', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.hide()
    return { success: true }
  })
}

export { registerIpcHandlers }
