import { ipcMain, BrowserWindow, shell, app } from 'electron'
import Store from 'electron-store'
import { getOverlayWindow, toggleOverlay, setOverlayOpacity, setOverlayClickThrough } from './overlay'
import { startAudioCapture, stopAudioCapture, sendAudioChunk, setSampleRate } from '../utils/audio'
import { checkForUpdates } from './updater'
import { captureScreen } from '../utils/screen'
import { startMicCapture, stopMicCapture } from './mic-window'
import {
  getAuth,
  setAuth,
  clearAuth,
  isLoggedIn,
  loginWithPassword,
  registerWithPassword,
  loginWithToken,
  fetchMe,
  createSttSession,
  reportSttUsage,
  cloudSuggest,
  cloudAnalyzeScreen,
  cloudAskAboutScreen,
  cloudRecap,
  cloudMockStart,
  fetchProfile,
  saveProfile,
  fetchPlaybooks,
  createPlaybook,
  useCloudAI,
  getApiBase,
  isCloudUnavailableError
} from '../utils/cloud/client'
import {
  activateLicense,
  ensureLicenseValid,
  hasLicenseKey,
  getStoredLicense,
  clearLicense
} from '../utils/cloud/license'

const store = new Store({
  encryptionKey: 'cluemind-secure-key-v1',
  schema: {
    aiProvider: { type: 'string', default: 'claude' },
    geminiApiKey: { type: 'string', default: '' },
    openaiApiKey: { type: 'string', default: '' },
    claudeApiKey: { type: 'string', default: '' },
    grokApiKey: { type: 'string', default: '' },
    deepgramApiKey: { type: 'string', default: '' },
    defaultMode: { type: 'string', default: 'meeting' },
    interviewLanguage: { type: 'string', default: 'javascript' },
    spokenLanguage: { type: 'string', default: 'en' },
    rolePack: { type: 'string', default: 'swe' },
    autoSuggest: { type: 'boolean', default: false },
    audioSource: { type: 'string', default: 'auto' },
    overlayOpacity: { type: 'number', default: 1 }
  }
})

/** Prevent flooding the AI with the same question on every final Deepgram chunk */
const suggestionGate = {
  timer: null,
  inFlight: false,
  lastAnsweredText: '',
  lastAnsweredAt: 0,
  lastQuestionFingerprint: '',
  debounceMs: 15000,
  minCooldownMs: 14000,
  minNewChars: 55
}

function normalizeTranscript(text) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Rough fingerprint of the likely latest question (last 1–2 transcript chunks).
 * Used to avoid re-answering the same interviewer question.
 */
function fingerprintLatestQuestion(transcriptText) {
  const parts = (transcriptText || '')
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean)
  const tail = parts.slice(-2).join(' ')
  return normalizeTranscript(tail).slice(-220)
}

function pushUsage(overlay, usage) {
  const win = overlay || getOverlayWindow()
  if (usage && win && !win.isDestroyed()) {
    win.webContents.send('USAGE_UPDATE', usage)
  }
}

function scheduleAISuggestion(sessionState, overlay) {
  if (!store.get('autoSuggest', false)) return
  if (sessionState.mode === 'mock') return
  if (suggestionGate.timer) clearTimeout(suggestionGate.timer)

  suggestionGate.timer = setTimeout(async () => {
    suggestionGate.timer = null
    if (!sessionState.isActive || suggestionGate.inFlight) return

    const recentTranscript = sessionState.transcript
      .filter(t => t.isFinal)
      .slice(-20)
      .map(t => t.text)
      .join('\n')
      .trim()

    if (!recentTranscript || recentTranscript.length < 20) return

    const normalized = normalizeTranscript(recentTranscript)
    const questionFp = fingerprintLatestQuestion(recentTranscript)
    const now = Date.now()
    const sinceLast = now - suggestionGate.lastAnsweredAt
    const last = suggestionGate.lastAnsweredText

    // Same latest question already answered → skip
    if (questionFp && questionFp === suggestionGate.lastQuestionFingerprint && sinceLast < 90000) {
      return
    }

    // Skip near-duplicates / tiny appends of the same answered stretch
    if (last) {
      if (normalized === last) return
      if (normalized.startsWith(last) && normalized.length - last.length < suggestionGate.minNewChars) return
      if (last.includes(normalized) && last.length - normalized.length < 80) return
      if (sinceLast < suggestionGate.minCooldownMs && normalized.includes(last.slice(-120))) return
    }

    if (sinceLast < suggestionGate.minCooldownMs && last) {
      const newTail = normalized.slice(Math.max(0, last.length - 40))
      if (newTail.length < suggestionGate.minNewChars) return
    }

    suggestionGate.inFlight = true
    try {
      console.log(`[ai] Generating suggestion (mode=${sessionState.mode}, chars=${recentTranscript.length})`)
      const priorAnswers = (sessionState.suggestions || []).slice(-4)
      const suggestion = await withCloudAI(() => cloudSuggest({
        transcript: recentTranscript,
        mode: sessionState.mode,
        priorAnswers
      }))
      if (suggestion?.usage) pushUsage(overlay, suggestion.usage)
      if (suggestion && sessionState.isActive) {
        // Always advance the gate so we don't hammer the same question
        suggestionGate.lastAnsweredText = normalized
        suggestionGate.lastAnsweredAt = Date.now()
        suggestionGate.lastQuestionFingerprint = questionFp

        if (suggestion.skipUI) {
          console.log('[ai] Skipping UI for status/no-question response')
          return
        }

        sessionState.suggestions.push(suggestion)
        sessionState.memory.push(`[AI Suggestion - ${sessionState.mode}] ${suggestion.suggestion}`)
        const win = overlay || getOverlayWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('AI_SUGGESTION', suggestion)
        }
      }
    } catch (err) {
      console.error('AI suggestion error:', err)
      const win = overlay || getOverlayWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('MIC_STATUS', {
          ready: false,
          error: 'AI answer failed: ' + (err.message || String(err))
        })
      }
    } finally {
      suggestionGate.inFlight = false
    }
  }, suggestionGate.debounceMs)
}

function resetSuggestionGate() {
  if (suggestionGate.timer) clearTimeout(suggestionGate.timer)
  suggestionGate.timer = null
  suggestionGate.inFlight = false
  suggestionGate.lastAnsweredText = ''
  suggestionGate.lastAnsweredAt = 0
  suggestionGate.lastQuestionFingerprint = ''
}

/** Clear any previously saved user BYOK keys (admin keys live on the API only). */
function scrubLocalApiKeys() {
  store.set('geminiApiKey', '')
  store.set('openaiApiKey', '')
  store.set('claudeApiKey', '')
  store.set('grokApiKey', '')
  store.set('deepgramApiKey', '')
}

/**
 * Always use admin-configured cloud AI for licensed users.
 */
async function withCloudAI(cloudFn) {
  await ensureLicenseValid()
  try {
    console.log('[ai] Using ClueMind Cloud AI (admin keys)')
    return await cloudFn()
  } catch (err) {
    if (!isCloudUnavailableError(err)) throw err
    console.warn('[ai] Cloud AI unavailable:', err.message)
    throw new Error(
      'AI is temporarily unavailable. Please try again in a moment, or contact support if this continues.'
    )
  }
}

/**
 * Register all IPC handlers for main process communication
 * @param {object} sessionState - The application session state
 * @param {Function} createSettingsWindow - Function to open settings
 * @param {Function} [createLoginWindow] - Function to open login
 * @param {Function} [requestAppQuit] - Force quit the application
 */
function registerIpcHandlers(sessionState, createSettingsWindow, createLoginWindow, requestAppQuit) {
  scrubLocalApiKeys()

  ipcMain.handle('GET_SETTINGS', () => {
    const auth = getAuth()
    const lic = getStoredLicense()
    return {
      defaultMode: store.get('defaultMode', 'meeting'),
      interviewLanguage: store.get('interviewLanguage', 'javascript'),
      spokenLanguage: store.get('spokenLanguage', 'en'),
      rolePack: store.get('rolePack', 'swe'),
      autoSuggest: store.get('autoSuggest', false),
      audioSource: store.get('audioSource', 'auto'),
      overlayOpacity: store.get('overlayOpacity', 1),
      apiBase: getApiBase(),
      licensed: hasLicenseKey(),
      licensePlan: lic.meta?.plan || null,
      cloudMode: useCloudAI(),
      authUser: auth.user,
      webAppUrl: (getApiBase().includes('8787')
        ? getApiBase().replace('8787', '5173')
        : getApiBase())
    }
  })

  ipcMain.handle('SAVE_SETTINGS', (_event, settings) => {
    // User preferences only - API keys are never accepted from the client
    if (settings.defaultMode !== undefined) store.set('defaultMode', settings.defaultMode)
    if (settings.interviewLanguage !== undefined) store.set('interviewLanguage', settings.interviewLanguage)
    if (settings.spokenLanguage !== undefined) store.set('spokenLanguage', settings.spokenLanguage)
    if (settings.rolePack !== undefined) store.set('rolePack', settings.rolePack)
    if (settings.autoSuggest !== undefined) store.set('autoSuggest', Boolean(settings.autoSuggest))
    if (settings.audioSource !== undefined) store.set('audioSource', settings.audioSource)
    if (settings.overlayOpacity !== undefined) {
      store.set('overlayOpacity', settings.overlayOpacity)
      setOverlayOpacity(settings.overlayOpacity)
    }
    scrubLocalApiKeys()
    console.log('[SAVE_SETTINGS] Preferences saved (no API keys stored)')
    return { success: true }
  })

  ipcMain.handle('GET_AUTH', async () => {
    const auth = getAuth()
    if (!auth.token) return { loggedIn: false, user: null, apiBase: getApiBase() }
    try {
      const me = await fetchMe()
      return {
        loggedIn: true,
        user: me.user,
        usage: me.usage,
        planDetails: me.planDetails,
        apiBase: getApiBase()
      }
    } catch {
      return { loggedIn: true, user: auth.user, apiBase: getApiBase(), stale: true }
    }
  })

  ipcMain.handle('CLOUD_LOGIN', async (_event, { email, password }) => {
    try {
      const auth = await loginWithPassword(email, password)
      return { success: true, user: auth.user }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('CLOUD_REGISTER', async (_event, { name, email, password }) => {
    try {
      const auth = await registerWithPassword({ name, email, password })
      return { success: true, user: auth.user }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('CLOUD_LOGOUT', () => {
    clearAuth()
    return { success: true }
  })

  ipcMain.handle('CLOUD_LOGIN_TOKEN', async (_event, token) => {
    try {
      const auth = await loginWithToken(token)
      return { success: true, user: auth.user }
    } catch (err) {
      clearAuth()
      return { success: false, error: err.message }
    }
  })

  ipcMain.removeHandler('OPEN_LOGIN')
  ipcMain.handle('OPEN_LOGIN', (_event, opts = {}) => {
    try {
      if (typeof createLoginWindow === 'function') createLoginWindow(opts || {})
      return { success: true }
    } catch (err) {
      console.error('[ipc] OPEN_LOGIN failed:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('CLOSE_LOGIN', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.close()
    return { success: true }
  })

  ipcMain.removeHandler('QUIT_APP')
  ipcMain.handle('QUIT_APP', () => {
    if (typeof requestAppQuit === 'function') requestAppQuit()
    else app.quit()
    return { success: true }
  })

  ipcMain.removeHandler('MINIMIZE_LOGIN')
  ipcMain.handle('MINIMIZE_LOGIN', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.minimize()
    return { success: true }
  })

  ipcMain.handle('OPEN_EXTERNAL', (_event, url) => {
    if (url) shell.openExternal(String(url))
    return { success: true }
  })

  ipcMain.removeHandler('ACTIVATE_LICENSE')
  ipcMain.handle('ACTIVATE_LICENSE', async (_event, key) => {
    try {
      const data = await activateLicense(key)
      return { success: true, ...data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.removeHandler('GET_LICENSE_STATUS')
  ipcMain.handle('GET_LICENSE_STATUS', async () => {
    try {
      if (!hasLicenseKey()) return { activated: false }
      const data = await ensureLicenseValid({ force: false })
      return {
        activated: true,
        plan: data.plan,
        stealth: data.stealth,
        user: data.user,
        cached: data.cached
      }
    } catch (err) {
      return { activated: false, error: err.message }
    }
  })

  ipcMain.removeHandler('CLEAR_LICENSE')
  ipcMain.handle('CLEAR_LICENSE', () => {
    clearLicense()
    return { success: true }
  })

  ipcMain.handle('START_SESSION', async () => {
    console.log('IPC: START_SESSION received')

    try {
      await ensureLicenseValid()
    } catch (err) {
      if (typeof createLoginWindow === 'function') createLoginWindow()
      return {
        success: false,
        error: err.message || 'Activate ClueMind with a license key from your dashboard first.'
      }
    }
    let deepgramApiKey = ''
    let stealth = false
    const spokenLanguage = store.get('spokenLanguage', 'en')
    let sttProvider = 'deepgram'

    try {
      const stt = await createSttSession(spokenLanguage)
      sttProvider = stt.provider || 'deepgram'
      deepgramApiKey = stt.apiKey || ''
      stealth = Boolean(stt.stealth)
      sessionState.cloudSttStartedAt = Date.now()
      sessionState.planStealth = stealth
      sessionState.sttProvider = sttProvider
      pushUsage(getOverlayWindow(), stt.usage)
      console.log(`[stt] Session provider=${sttProvider}`)
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Speech is temporarily unavailable. Please try again later or contact support.'
      }
    }

    sessionState.isActive = true
    sessionState.startTime = Date.now()
    sessionState.transcript = []
    sessionState.suggestions = []
    sessionState.memory = []
    resetSuggestionGate()

    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.setContentProtection(true)
      setOverlayClickThrough(true)
      overlay.webContents.send('HOTKEY', { action: 'click-through', on: true })
    }

    try {
      if (sttProvider === 'browser') {
        if (overlay && !overlay.isDestroyed()) {
          overlay.webContents.send('START_BROWSER_STT', { language: spokenLanguage })
        }
      } else {
        startAudioCapture(deepgramApiKey, (transcript) => {
          sessionState.transcript.push(transcript)
          if (overlay && !overlay.isDestroyed()) {
            overlay.webContents.send('TRANSCRIPT_UPDATE', transcript)
          }
          if (transcript.isFinal) {
            scheduleAISuggestion(sessionState, overlay)
          }
        }, spokenLanguage)
        startMicCapture({ source: store.get('audioSource', 'auto') })
      }
      return { success: true, cloud: useCloudAI(), stealth, sttProvider, language: spokenLanguage }
    } catch (err) {
      sessionState.isActive = false
      return { success: false, error: err.message }
    }
  })

  let ipcChunkCount = 0
  ipcMain.on('SEND_AUDIO_DATA', (_event, chunk) => {
    if (sessionState.isActive) {
      const buf = Buffer.from(chunk)
      ipcChunkCount++
      if (ipcChunkCount % 20 === 1) console.log(`[ipc] Audio chunk #${ipcChunkCount}, size: ${buf.byteLength}`)
      if (buf.byteLength > 0) {
        sendAudioChunk(buf)
      }
    }
  })

  ipcMain.on('AUDIO_SAMPLE_RATE', (_event, rate) => {
    console.log('[ipc] Audio sample rate:', rate)
    setSampleRate(rate)
  })

  ipcMain.on('MIC_READY', (_event, mode) => {
    console.log(`Mic capture ready - audio flowing (mode=${mode || 'unknown'})`)
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('MIC_STATUS', { ready: true, mode: mode || 'unknown' })
    }
  })

  ipcMain.on('MIC_ERROR', (_event, msg) => {
    console.error('Mic capture error:', msg)
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('MIC_STATUS', { ready: false, error: msg })
    }
  })

  ipcMain.handle('STOP_SESSION', async () => {
    sessionState.isActive = false
    resetSuggestionGate()
    stopAudioCapture()
    stopMicCapture()
    const overlayStop = getOverlayWindow()
    if (overlayStop && !overlayStop.isDestroyed()) {
      overlayStop.webContents.send('STOP_BROWSER_STT')
    }

    if (useCloudAI() && sessionState.cloudSttStartedAt) {
      const seconds = Math.max(1, Math.round((Date.now() - sessionState.cloudSttStartedAt) / 1000))
      try {
        await reportSttUsage(seconds)
      } catch (err) {
        console.warn('[stt] usage report failed:', err.message)
      }
      sessionState.cloudSttStartedAt = null
    }

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
      if (sessions.length > 50) sessions.splice(0, sessions.length - 50)
      store.set('pastSessions', sessions)
    }

    return { success: true }
  })

  ipcMain.handle('CAPTURE_SCREEN', async () => {
    try {
      try {
        await ensureLicenseValid()
      } catch (err) {
        if (typeof createLoginWindow === 'function') createLoginWindow()
        return {
          success: false,
          error: err.message || 'Activate ClueMind with a license key first.'
        }
      }

      console.log('[capture] Taking screenshot...')
      const base64Image = await captureScreen()
      sessionState.lastScreenCapture = base64Image

      const analysis = await withCloudAI(() => cloudAnalyzeScreen({
        imageBase64: base64Image,
        memory: sessionState.memory
      }))

      if (!analysis?.suggestion) {
        return { success: false, error: 'AI returned an empty analysis. Try Capture again.' }
      }

      sessionState.memory.push(`[Screen Capture] ${analysis.suggestion}`)
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
    try {
      await ensureLicenseValid()
    } catch (err) {
      if (typeof createLoginWindow === 'function') createLoginWindow()
      return {
        success: false,
        error: err.message || 'Activate ClueMind with a license key first.'
      }
    }

    if (!sessionState.lastScreenCapture) {
      return { success: false, error: 'No screen capture yet. Click Capture first.' }
    }

    try {
      const answer = await withCloudAI(() => cloudAskAboutScreen({
        imageBase64: sessionState.lastScreenCapture,
        question,
        memory: sessionState.memory
      }))

      sessionState.memory.push(`[Q: ${question}] ${answer.suggestion}`)
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
    try {
      const suggestion = await withCloudAI(() => cloudSuggest({
        transcript: text,
        mode: mode || sessionState.mode,
        priorAnswers: []
      }))
      return { success: true, suggestion }
    } catch (err) {
      if (typeof createLoginWindow === 'function' && /license/i.test(err.message || '')) {
        createLoginWindow()
      }
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('GET_INTERVIEW_HELP', async (_event, { question }) => {
    try {
      const help = await withCloudAI(() => cloudSuggest({
        transcript: question,
        mode: 'interview',
        priorAnswers: []
      }))
      return { success: true, help }
    } catch (err) {
      if (typeof createLoginWindow === 'function' && /license/i.test(err.message || '')) {
        createLoginWindow()
      }
      return { success: false, error: err.message }
    }
  })

  ipcMain.removeHandler('OPEN_SETTINGS')
  ipcMain.handle('CHECK_FOR_UPDATES', async () => {
    try {
      return { success: true, ...(await checkForUpdates(true)) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('OPEN_SETTINGS', () => {
    try {
      createSettingsWindow()
      return { success: true }
    } catch (err) {
      console.error('[ipc] OPEN_SETTINGS failed:', err)
      return { success: false, error: err.message }
    }
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

  ipcMain.handle('TEST_AI', async () => {
    return { success: false, error: 'API keys are managed by your admin on the server.' }
  })

  ipcMain.handle('TEST_DEEPGRAM', async () => {
    return { success: false, error: 'API keys are managed by your admin on the server.' }
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

  ipcMain.on('BROWSER_TRANSCRIPT', (_event, data) => {
    if (!sessionState.isActive || !data?.text) return
    const transcript = {
      text: String(data.text),
      isFinal: Boolean(data.isFinal),
      timestamp: Date.now(),
      confidence: data.confidence || 0.7
    }
    if (transcript.isFinal) sessionState.transcript.push(transcript)
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('TRANSCRIPT_UPDATE', transcript)
    }
    if (transcript.isFinal) scheduleAISuggestion(sessionState, overlay)
  })

  async function generateFromTranscript(force = false) {
    const recentTranscript = sessionState.transcript
      .filter((t) => t.isFinal)
      .slice(-20)
      .map((t) => t.text)
      .join('\n')
      .trim()
    if (!recentTranscript || (recentTranscript.length < 8 && !force)) {
      const err = new Error('Need a bit more transcript first')
      throw err
    }
    const suggestion = await withCloudAI(() => cloudSuggest({
      transcript: recentTranscript,
      mode: sessionState.mode,
      priorAnswers: (sessionState.suggestions || []).slice(-4)
    }))
    if (suggestion?.usage) pushUsage(getOverlayWindow(), suggestion.usage)
    if (suggestion && !suggestion.skipUI) {
      sessionState.suggestions.push(suggestion)
      sessionState.memory.push(`[AI Suggestion - ${sessionState.mode}] ${suggestion.suggestion}`)
      const win = getOverlayWindow()
      if (win && !win.isDestroyed()) win.webContents.send('AI_SUGGESTION', suggestion)
    }
    return suggestion
  }

  ipcMain.handle('ASK_NOW', async () => {
    try {
      await ensureLicenseValid()
      const suggestion = await generateFromTranscript(true)
      return { success: true, suggestion }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('GET_USAGE', async () => {
    try {
      const me = await fetchMe()
      pushUsage(getOverlayWindow(), me.usage)
      return { success: true, usage: me.usage, user: me.user }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('RECAP_SESSION', async () => {
    try {
      await ensureLicenseValid()
      const transcriptText = sessionState.transcript.filter((t) => t.isFinal).map((t) => t.text).join('\n')
      const result = await withCloudAI(() => cloudRecap({
        transcript: transcriptText,
        suggestions: sessionState.suggestions,
        mode: sessionState.mode,
        durationMs: sessionState.startTime ? Date.now() - sessionState.startTime : 0
      }))
      if (result?.usage) pushUsage(getOverlayWindow(), result.usage)
      if (result?.recap) {
        const win = getOverlayWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('AI_SUGGESTION', {
            suggestion: result.recap,
            type: 'recap',
            code: null
          })
        }
      }
      return { success: true, ...result }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('START_MOCK', async () => {
    try {
      await ensureLicenseValid()
      sessionState.mode = 'mock'
      const result = await withCloudAI(() => cloudMockStart())
      if (result?.usage) pushUsage(getOverlayWindow(), result.usage)
      if (result) {
        sessionState.suggestions.push(result)
        const win = getOverlayWindow()
        if (win && !win.isDestroyed()) win.webContents.send('AI_SUGGESTION', result)
      }
      return { success: true, suggestion: result }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('GET_PROFILE', async () => {
    try {
      return { success: true, ...(await fetchProfile()) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('SAVE_PROFILE', async (_event, body) => {
    try {
      const data = await saveProfile(body || {})
      if (body?.language) store.set('spokenLanguage', body.language)
      if (body?.rolePack) store.set('rolePack', body.rolePack)
      return { success: true, ...data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('GET_PLAYBOOKS', async () => {
    try {
      return { success: true, ...(await fetchPlaybooks()) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('ADD_PLAYBOOK', async (_event, body) => {
    try {
      return { success: true, ...(await createPlaybook(body || {})) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('SET_OVERLAY_OPACITY', (_event, value) => {
    const next = setOverlayOpacity(value)
    store.set('overlayOpacity', next)
    return { success: true, opacity: next }
  })

  ipcMain.handle('SET_CLICK_THROUGH', (_event, on) => {
    const next = setOverlayClickThrough(on)
    return { success: true, clickThrough: next }
  })
}

export { registerIpcHandlers }
