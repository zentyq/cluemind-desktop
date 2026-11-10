/**
 * ClueMind AI Assistant - Overlay Renderer Logic
 * Handles UI interactions, transcript display, and AI suggestion rendering
 */

// ═══ State ═══
let isSessionActive = false
let currentMode = 'meeting'
let isMinimized = false
let sessionStartTime = null
let timerInterval = null
let suggestionCount = 0
let interimLineEl = null

// ═══ DOM Elements ═══
const overlayContainer = document.getElementById('overlayContainer')
const sessionTimer = document.getElementById('sessionTimer')
const apiBanner = document.getElementById('apiBanner')
const bannerSettingsBtn = document.getElementById('bannerSettingsBtn')
const bannerLoginBtn = document.getElementById('bannerLoginBtn')
const apiBannerText = document.getElementById('apiBannerText')
const recordingIndicator = document.getElementById('recordingIndicator')
const transcriptScroll = document.getElementById('transcriptScroll')
const transcriptEmpty = document.getElementById('transcriptEmpty')
const suggestionsScroll = document.getElementById('suggestionsScroll')
const suggestionsEmpty = document.getElementById('suggestionsEmpty')
const suggestionCountEl = document.getElementById('suggestionCount')
const statusBar = document.getElementById('statusBar')
const statusText = document.getElementById('statusText')
const toggleSessionBtn = document.getElementById('toggleSessionBtn')
const captureScreenBtn = document.getElementById('captureScreenBtn')
const clearChatBtn = document.getElementById('clearChatBtn')
const settingsBtn = document.getElementById('settingsBtn')
const minimizeBtn = document.getElementById('minimizeBtn')
const closeBtn = document.getElementById('closeBtn')
const minimizedPill = document.getElementById('minimizedPill')
const pillMode = document.getElementById('pillMode')
const pillDot = document.getElementById('pillDot')
const pillExpand = document.getElementById('pillExpand')
const modeToggle = document.getElementById('modeToggle')
const modeMenu = document.getElementById('modeMenu')
const modeBar = document.getElementById('modeBar')
const modeValue = document.getElementById('modeValue')
const modeItems = document.querySelectorAll('.menu-item[data-mode]')
const chatInput = document.getElementById('chatInput')
const chatSendBtn = document.getElementById('chatSendBtn')
const workspace = document.getElementById('workspace')
const askNowBtn = document.getElementById('askNowBtn')
const usageMeter = document.getElementById('usageMeter')
const stealthLockBadge = document.getElementById('stealthLockBadge')

let browserRecognition = null
const MODE_ORDER = ['meeting', 'interview', 'screen', 'mock']

let activePanel = 'ai'

function updateStealthBadge(isClickThrough) {
  if (!stealthLockBadge) return
  if (isClickThrough) {
    stealthLockBadge.textContent = 'NO-MOUSE · ⌃⇧C'
    stealthLockBadge.classList.add('active')
  } else {
    stealthLockBadge.textContent = 'MOUSE ON · ⌃⇧C'
    stealthLockBadge.classList.remove('active')
  }
}

// ═══ Initialization ═══

/**
 * Initialize the overlay application
 */
async function init() {
  await checkApiKeys()
  await loadSessionState()
  setupEventListeners()
  setupIpcListeners()
  refreshUsage()
}

/**
 * Check license status and show banner if needed
 */
async function checkApiKeys() {
  try {
    const settings = await window.cluemind.getSettings()
    if (settings.defaultMode) {
      currentMode = settings.defaultMode
      updateModeUI(currentMode)
    }

    const lic = await window.cluemind.getLicenseStatus()
    if (lic?.activated) {
      apiBanner.style.display = 'none'
      await window.cluemind.setClickThrough?.(true)
      updateStealthBadge(true)
      return
    }

    await window.cluemind.setClickThrough?.(false)
    updateStealthBadge(false)
    apiBannerText.textContent = 'Activate with a license key from your ClueMind dashboard to use AI'
    apiBanner.style.display = 'flex'
    if (bannerLoginBtn) bannerLoginBtn.textContent = 'Activate'
  } catch (err) {
    console.error('Failed to check license:', err)
  }
}

/**
 * Load existing session state from main process
 */
async function loadSessionState() {
  try {
    const state = await window.cluemind.getSessionState()
    if (state.isActive) {
      isSessionActive = true
      sessionStartTime = state.startTime
      updateSessionUI(true)
      startTimer()
    }
    if (state.mode) {
      currentMode = state.mode
      updateModeUI(currentMode)
    }
  } catch (err) {
    console.error('Failed to load session state:', err)
  }
}

// ═══ Event Listeners ═══

/**
 * Set up all DOM event listeners
 */
function setupEventListeners() {
  askNowBtn?.addEventListener('click', askNow)

  // Toggle session
  toggleSessionBtn.addEventListener('click', toggleSession)

  // Capture screen
  captureScreenBtn.addEventListener('click', captureScreen)

  // Clear chat
  clearChatBtn.addEventListener('click', clearAll)

  // Settings buttons
  settingsBtn?.addEventListener('click', openSettings)
  bannerSettingsBtn?.addEventListener('click', openSettings)
  bannerLoginBtn?.addEventListener('click', () => window.cluemind.openLogin())

  // Chat input
  chatSendBtn.addEventListener('click', sendChatQuestion)
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendChatQuestion()
    }
  })

  // Minimize collapses to pill, close hides window (restore via tray or Ctrl+Shift+A)
  minimizeBtn.addEventListener('click', minimizeOverlay)
  closeBtn.addEventListener('click', () => window.cluemind.closeWindow())
  pillExpand.addEventListener('click', expandOverlay)
  minimizedPill.addEventListener('click', expandOverlay)

  // Mode picker bar
  modeToggle?.addEventListener('click', () => {
    const open = modeBar.classList.toggle('open')
    modeToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    if (modeMenu) modeMenu.hidden = !open
  })

  modeItems.forEach((item) => {
    item.addEventListener('click', () => {
      switchMode(item.dataset.mode)
      modeBar.classList.remove('open')
      modeToggle?.setAttribute('aria-expanded', 'false')
      if (modeMenu) modeMenu.hidden = true
    })
  })

  // Accordion workspace panels
  workspace?.querySelectorAll('.acc-bar[data-open]')?.forEach((bar) => {
    bar.addEventListener('click', () => openPanel(bar.getAttribute('data-open')))
  })
}

/**
 * Set up IPC event listeners from main process
 */
function setupIpcListeners() {
  // Transcript updates (with source labels)
  window.cluemind.onTranscriptUpdate((data) => {
    addTranscriptLine(data)
  })

  // AI suggestions
  window.cluemind.onAISuggestion((data) => {
    addSuggestionCard(data)
  })

  // Toggle session from tray
  window.cluemind.onToggleSession(() => {
    toggleSession()
  })

  window.cluemind.onMicStatus((status) => {
    if (!isSessionActive) return
    if (status.ready) {
      const label = status.mode === 'system'
        ? 'Listening to system audio (Zoom/Meet)...'
        : status.mode === 'microphone'
          ? 'Listening via microphone...'
          : 'Listening...'
      showStatus(label)
      setTimeout(() => hideStatus(), 2500)
    } else if (status.error) {
      showStatus('Audio capture failed: ' + status.error, true)
    }
  })

  window.cluemind.onAuthChanged?.(() => {
    checkApiKeys()
    refreshUsage()
  })

  window.cluemind.onUsageUpdate?.((usage) => renderUsage(usage))

  window.cluemind.onHotkey?.((data) => {
    if (data.action === 'toggle-session') toggleSession()
    if (data.action === 'ask-now') askNow()
    if (data.action === 'capture-screen') captureScreen()
    if (data.action === 'recap-session') {
      window.cluemind.recapSession?.().then((res) => {
        if (res?.success) showStatus('Recap generated')
        else if (res?.error) showStatus(res.error, true)
        setTimeout(() => hideStatus(), 2000)
      })
    }
    if (data.action === 'scroll') {
      const delta = Number(data.delta) || 140
      const target = activePanel === 'transcript' ? transcriptScroll : suggestionsScroll
      if (target) {
        target.scrollBy({ top: delta, behavior: 'smooth' })
      }
    }
    if (data.action === 'toggle-expand') {
      const firstToggle = suggestionsScroll?.querySelector('.expand-toggle')
      if (firstToggle) firstToggle.click()
    }
    if (data.action === 'copy-latest') {
      const firstCodeBtn = suggestionsScroll?.querySelector('.suggestion-card .code-copy-btn')
      const firstCardBtn = suggestionsScroll?.querySelector('.suggestion-card .card-copy-btn')
      if (firstCodeBtn) {
        firstCodeBtn.click()
        showStatus('Copied code to clipboard (Ctrl+Shift+Y)')
        setTimeout(() => hideStatus(), 1500)
      } else if (firstCardBtn) {
        firstCardBtn.click()
        showStatus('Copied answer to clipboard (Ctrl+Shift+Y)')
        setTimeout(() => hideStatus(), 1500)
      }
    }
    if (data.action === 'toggle-panel') {
      openPanel(activePanel === 'ai' ? 'transcript' : 'ai')
      showStatus(activePanel === 'ai' ? 'Switched to AI Workspace' : 'Switched to Live Transcript')
      setTimeout(() => hideStatus(), 1200)
    }
    if (data.action === 'cycle-mode') {
      const idx = MODE_ORDER.indexOf(currentMode)
      switchMode(MODE_ORDER[(idx + 1) % MODE_ORDER.length])
      showStatus(`Mode: ${currentMode.toUpperCase()}`)
      setTimeout(() => hideStatus(), 1200)
    }
    if (data.action === 'clear-all') {
      clearAll()
    }
    if (data.action === 'toggle-minimize') {
      if (isMinimized) expandOverlay()
      else minimizeOverlay()
    }
    if (data.action === 'opacity') {
      showStatus(`Opacity ${Math.round((data.opacity || 1) * 100)}%`)
      setTimeout(() => hideStatus(), 1200)
    }
    if (data.action === 'click-through') {
      updateStealthBadge(Boolean(data.on))
      showStatus(
        data.on
          ? 'Stealth No-Mouse ON (use shortcut keys · Ctrl+Shift+C to unlock mouse)'
          : 'Mouse Unlocked (Ctrl+Shift+C to re-lock for screen share)'
      )
      setTimeout(() => hideStatus(), 2200)
    }
  })

  window.cluemind.onStartBrowserStt?.((opts) => startBrowserStt(opts?.language || 'en'))
  window.cluemind.onStopBrowserStt?.(() => stopBrowserStt())
}

// ═══ Session Control ═══

/**
 * Toggle recording session on/off
 */
async function toggleSession() {
  if (isSessionActive) {
    await stopSession()
  } else {
    await startSession()
  }
}

/**
 * Start a new recording session
 */
async function startSession() {
  showStatus('Starting session...')
  console.log('startSession called, mode:', currentMode)

  try {
    console.log('Calling window.cluemind.startSession...')
    const result = await window.cluemind.startSession()
    console.log('startSession result:', JSON.stringify(result))
    if (result.success) {
      isSessionActive = true
      sessionStartTime = Date.now()
      updateSessionUI(true)
      startTimer()
      clearTranscript()
      showStatus('Session active - mic starting...')
      setTimeout(() => {
        if (isSessionActive) showStatus('Session active - listening...')
        setTimeout(() => hideStatus(), 2000)
      }, 2000)
    } else {
      showStatus(result.error || 'Failed to start session', true)
    }
  } catch (err) {
    showStatus('Error starting session: ' + err.message, true)
  }
}

/**
 * Stop the current recording session
 */
async function stopSession() {
  showStatus('Stopping session...')

  try {
    await window.cluemind.stopSession()
    isSessionActive = false
    updateSessionUI(false)
    stopTimer()
    stopBrowserStt()
    showStatus('Session ended - writing recap...')
    try {
      const recap = await window.cluemind.recapSession()
      if (recap?.success) {
        showStatus('Recap saved to your dashboard')
      } else {
        showStatus(recap?.error || 'Session ended')
      }
    } catch {
      showStatus('Session ended')
    }
    refreshUsage()
    setTimeout(() => hideStatus(), 3000)
  } catch (err) {
    showStatus('Error stopping session: ' + err.message, true)
  }
}

/**
 * Update UI elements based on session state
 * @param {boolean} active - Whether session is active
 */
function updateSessionUI(active) {
  if (active) {
    toggleSessionBtn.classList.add('recording')
    toggleSessionBtn.querySelector('span').textContent = 'Stop'
    recordingIndicator.style.display = 'flex'
    pillDot.classList.add('active')
  } else {
    toggleSessionBtn.classList.remove('recording')
    toggleSessionBtn.querySelector('span').textContent = 'Start'
    recordingIndicator.style.display = 'none'
    pillDot.classList.remove('active')
  }
}

// ═══ Timer ═══

/**
 * Start the session timer display
 */
function startTimer() {
  stopTimer()
  timerInterval = setInterval(() => {
    if (!sessionStartTime) return
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000)
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0')
    const secs = String(elapsed % 60).padStart(2, '0')
    sessionTimer.textContent = `${mins}:${secs}`
  }, 1000)
}

/**
 * Stop the session timer
 */
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

// ═══ Mode Switching ═══

/**
 * Switch to a different assistant mode
 * @param {string} mode - 'meeting', 'interview', or 'screen'
 */
async function switchMode(mode) {
  currentMode = mode
  updateModeUI(mode)
  pillMode.textContent = mode.charAt(0).toUpperCase() + mode.slice(1)

  try {
    await window.cluemind.updateMode(mode)
    if (mode === 'mock') {
      showStatus('Starting mock interview...')
      const result = await window.cluemind.startMock()
      if (!result.success) showStatus(result.error || 'Could not start mock', true)
      else hideStatus()
    }
  } catch (err) {
    console.error('Failed to update mode:', err)
  }
}

async function askNow() {
  showStatus('Writing an answer...')
  if (askNowBtn) askNowBtn.disabled = true
  try {
    const result = await window.cluemind.askNow()
    if (!result.success) showStatus(result.error || 'Ask now failed', true)
    else {
      showStatus('Answer ready')
      setTimeout(() => hideStatus(), 1500)
    }
  } catch (err) {
    showStatus(err.message, true)
  } finally {
    if (askNowBtn) askNowBtn.disabled = false
  }
}

function renderUsage(usage) {
  if (!usageMeter || !usage) return
  const rem = usage.remaining || {}
  const ai = rem.aiCallsToday == null ? '∞' : rem.aiCallsToday
  const stt = rem.sttMinutesThisMonth == null ? '∞' : rem.sttMinutesThisMonth
  usageMeter.textContent = `AI ${ai} · STT ${stt}m`
}

async function refreshUsage() {
  try {
    const data = await window.cluemind.getUsage()
    if (data?.usage) renderUsage(data.usage)
  } catch (_) { /* ignore */ }
}

function startBrowserStt(lang) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    showStatus('Browser speech is not available on this system', true)
    return
  }
  stopBrowserStt()
  browserRecognition = new SpeechRecognition()
  browserRecognition.continuous = true
  browserRecognition.interimResults = true
  const langMap = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', hi: 'hi-IN', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', ar: 'ar-SA' }
  browserRecognition.lang = langMap[lang] || lang || 'en-US'
  browserRecognition.onresult = (event) => {
    let interim = ''
    let finalText = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0].transcript
      if (event.results[i].isFinal) finalText += piece
      else interim += piece
    }
    if (interim) {
      addTranscriptLine({ text: interim, isFinal: false })
      window.cluemind.sendBrowserTranscript({ text: interim, isFinal: false })
    }
    if (finalText.trim()) {
      addTranscriptLine({ text: finalText.trim(), isFinal: true })
      window.cluemind.sendBrowserTranscript({ text: finalText.trim(), isFinal: true })
    }
  }
  browserRecognition.onerror = (e) => {
    if (e.error !== 'no-speech') showStatus('Speech error: ' + e.error, true)
  }
  browserRecognition.onend = () => {
    if (isSessionActive && browserRecognition) {
      try { browserRecognition.start() } catch (_) { /* ignore */ }
    }
  }
  try {
    browserRecognition.start()
    showStatus('Listening with free browser speech...')
  } catch (err) {
    showStatus('Could not start speech: ' + err.message, true)
  }
}

function stopBrowserStt() {
  if (!browserRecognition) return
  const rec = browserRecognition
  browserRecognition = null
  try { rec.onend = null; rec.stop() } catch (_) { /* ignore */ }
}

/**
 * Update mode picker UI
 * @param {string} activeMode - The active mode
 */
function updateModeUI(activeMode) {
  const label = activeMode.charAt(0).toUpperCase() + activeMode.slice(1)
  if (modeValue) modeValue.textContent = label
  if (pillMode) pillMode.textContent = label
  modeItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.mode === activeMode)
  })
}

/**
 * Open one accordion workspace panel (closes the other)
 * @param {'transcript'|'ai'} panel
 */
function openPanel(panel) {
  activePanel = panel === 'transcript' ? 'transcript' : 'ai'
  document.querySelectorAll('.acc-panel').forEach((el) => {
    el.classList.toggle('open', el.dataset.panel === activePanel)
  })
}

// ═══ Transcript ═══

/**
 * Add a transcript line to the panel
 * @param {{text: string, isFinal: boolean, timestamp: number, confidence: number}} data
 */
function addTranscriptLine(data) {
  transcriptEmpty.style.display = 'none'

  if (data.isFinal) {
    // Remove interim line if exists
    if (interimLineEl) {
      interimLineEl.remove()
      interimLineEl = null
    }

    const line = document.createElement('div')
    line.className = 'transcript-line final'
    line.textContent = data.text
    transcriptScroll.appendChild(line)

    // Auto-scroll to bottom
    transcriptScroll.scrollTop = transcriptScroll.scrollHeight
  } else {
    // Update or create interim line
    if (!interimLineEl) {
      interimLineEl = document.createElement('div')
      interimLineEl.className = 'transcript-line interim'
      transcriptScroll.appendChild(interimLineEl)
    }
    interimLineEl.textContent = data.text
    transcriptScroll.scrollTop = transcriptScroll.scrollHeight
  }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Clear all transcript lines
 */
function clearTranscript() {
  const lines = transcriptScroll.querySelectorAll('.transcript-line')
  lines.forEach(l => l.remove())
  interimLineEl = null
  transcriptEmpty.style.display = 'flex'
}

/**
 * Clear all transcript and suggestion content (New Chat)
 */
function clearAll() {
  clearTranscript()
  // Clear suggestions
  const cards = suggestionsScroll.querySelectorAll('.suggestion-card')
  cards.forEach(c => c.remove())
  suggestionCount = 0
  suggestionCountEl.textContent = '0'
  suggestionsEmpty.style.display = 'flex'
  showStatus('Chat cleared')
  setTimeout(() => hideStatus(), 1500)
}

// ═══ AI Suggestions ═══

/**
 * Add an AI suggestion card to the panel
 * @param {{suggestion: string, code: string|null, type: string, confidence: number}} data
 */
function addSuggestionCard(data) {
  suggestionsEmpty.style.display = 'none'
  suggestionCount++
  suggestionCountEl.textContent = suggestionCount
  openPanel('ai')

  const card = document.createElement('div')
  card.className = 'suggestion-card'

  const typeConfig = getTypeConfig(data.type)
  const suggestionText = data.suggestion || ''
  const isInterviewType = data.type === 'interview' || data.type === 'interview-help'
  const hasInterviewStructure = /##?\s*(Question|Answer|Talking Points|Follow-ups|Strategy|Solution|Complexity|Status)/i.test(suggestionText)
  const hasMeetingStructure = (data.type === 'meeting' || data.type === 'recap' || data.type === 'mock') && /##?\s*(Summary|Suggestions|Action Items|Questions asked|Strong answers|Gaps to practice|Follow-ups|Feedback|Model answer|Next question)/i.test(suggestionText)

  let bodyHtml = ''
  if ((isInterviewType && hasInterviewStructure) || hasMeetingStructure) {
    bodyHtml = renderInterviewAnswer(suggestionText)
  } else {
    bodyHtml = renderMarkdown(suggestionText)
  }

  card.innerHTML = `
    <div class="card-header">
      <div class="card-type">
        <span class="card-type-icon">${typeConfig.icon}</span>
        ${typeConfig.label}
      </div>
      <button class="card-copy-btn" title="Copy to clipboard">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy
      </button>
    </div>
    <div class="card-body">${bodyHtml}</div>
  `

  const copyBtn = card.querySelector('.card-copy-btn')
  copyBtn.addEventListener('click', () => {
    // Prefer full readable answer; fall back to extracted code for coding answers
    const textToCopy = suggestionText || data.code || ''
    navigator.clipboard.writeText(textToCopy).then(() => {
      copyBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`
      copyBtn.classList.add('copied')
      setTimeout(() => {
        copyBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`
        copyBtn.classList.remove('copied')
      }, 2000)
    })
  })

  const expandToggle = card.querySelector('.expand-toggle')
  if (expandToggle) {
    expandToggle.addEventListener('click', () => {
      const targetId = expandToggle.dataset.target
      const target = document.getElementById(targetId)
      if (target) {
        const isVisible = target.classList.contains('visible')
        target.classList.toggle('visible')
        expandToggle.classList.toggle('expanded')
        const label = expandToggle.querySelector('.expand-label')
        if (label) {
          label.textContent = isVisible ? 'Show full solution' : 'Hide solution'
        }
      }
    })
  }

  setupCodeCopyButtons(card)
  suggestionsScroll.insertBefore(card, suggestionsScroll.firstChild)

  card.querySelectorAll('pre code').forEach(block => {
    if (typeof hljs !== 'undefined') {
      hljs.highlightElement(block)
    }
  })
}

/**
 * Get icon and label configuration for a suggestion type
 * @param {string} type - Suggestion type
 * @returns {{icon: string, label: string}}
 */
function getTypeConfig(type) {
  const configs = {
    'meeting': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2e6dff" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      label: 'Meeting Insight'
    },
    'interview': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2e6dff" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      label: 'Interview Answer'
    },
    'interview-help': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      label: 'Interview Help'
    },
    'screen': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2e6dff" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
      label: 'Screen Analysis'
    },
    'screen-analysis': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      label: 'Screen Analysis'    },
    'chat-answer': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      label: 'Answer'
    },
    'mock': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e8c56a" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
      label: 'Mock interview'
    },
    'recap': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      label: 'Session recap'
    }
  }

  return configs[type] || configs['meeting']
}

/**
 * Parse markdown sections headed by ## Title
 * @param {string} text
 * @returns {Array<{title: string, body: string}>}
 */
function parseMarkdownSections(text) {
  const sections = []
  const re = /^##\s+(.+?)\s*$/gm
  const matches = [...String(text || '').matchAll(re)]

  if (matches.length === 0) {
    return [{ title: '', body: String(text || '').trim() }]
  }

  for (let i = 0; i < matches.length; i++) {
    const title = matches[i][1].trim()
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    const body = text.slice(start, end).trim()
    sections.push({ title, body })
  }
  return sections
}

/**
 * Render a structured interview answer as scannable sections
 * @param {string} text
 * @returns {string}
 */
function renderInterviewAnswer(text) {
  const sections = parseMarkdownSections(text)
  const isCoding = sections.some(s => /^(strategy|solution|complexity)$/i.test(s.title))
  const cardId = `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const orderPreferred = isCoding
    ? ['Question', 'Strategy', 'Solution', 'Complexity', 'Status']
    : ['Question', 'Answer', 'Talking Points', 'Follow-ups', 'Summary', 'Suggestions', 'Action Items', 'Status']

  const byTitle = new Map()
  for (const section of sections) {
    const key = section.title.trim()
    if (!byTitle.has(key.toLowerCase())) {
      byTitle.set(key.toLowerCase(), section)
    }
  }

  const ordered = []
  for (const name of orderPreferred) {
    const found = byTitle.get(name.toLowerCase())
    if (found) {
      ordered.push(found)
      byTitle.delete(name.toLowerCase())
    }
  }
  // Keep any unexpected sections at the end (avoid losing content)
  for (const leftover of byTitle.values()) {
    ordered.push(leftover)
  }

  if (isCoding) {
    const question = ordered.find(s => /^question$/i.test(s.title))
    const strategy = ordered.find(s => /^strategy$/i.test(s.title))
    const solution = ordered.find(s => /^solution$/i.test(s.title))
    const complexity = ordered.find(s => /^complexity$/i.test(s.title))
    const status = ordered.find(s => /^status$/i.test(s.title))

    let html = ''
    if (status) {
      html += `<div class="answer-section answer-status"><div class="answer-section-label">Status</div><div class="answer-section-body">${renderMarkdown(status.body)}</div></div>`
    }
    if (question) {
      html += `<div class="answer-section answer-question"><div class="answer-section-label">Question</div><div class="answer-section-body">${renderMarkdown(question.body)}</div></div>`
    }
    if (strategy) {
      html += `<div class="strategy-hint"><div class="answer-section-label">Strategy</div><div class="answer-section-body">${renderMarkdown(strategy.body)}</div></div>`
    }

    const solutionParts = []
    if (solution) solutionParts.push(`## Solution\n${solution.body}`)
    if (complexity) solutionParts.push(`## Complexity\n${complexity.body}`)

    if (solutionParts.length) {
      html += `
        <button class="expand-toggle expanded" data-target="${cardId}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="expand-label">Hide solution (Ctrl+Shift+E)</span>
        </button>
        <div class="full-solution visible" id="${cardId}">${renderMarkdown(solutionParts.join('\n\n'))}</div>
      `
    }

    return html || renderMarkdown(text)
  }

  return ordered.map(section => {
    const slug = section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return `
      <div class="answer-section answer-${slug}">
        <div class="answer-section-label">${escapeHtml(section.title)}</div>
        <div class="answer-section-body">${renderMarkdown(section.body)}</div>
      </div>
    `
  }).join('')
}

/**
 * Parse an interview response into strategy hint and full solution
 * @param {string} text - Raw response text
 * @returns {{strategyHtml: string, solutionHtml: string}}
 */
function parseInterviewResponse(text) {
  const strategyMatch = text.match(/##?\s*Strategy\s*\n([\s\S]*?)(?=##?\s*Solution|##?\s*Code|```)/i)
  const strategyText = strategyMatch ? strategyMatch[1].trim() : text.split('\n').slice(0, 3).join('\n')

  const solutionStart = text.search(/##?\s*(Solution|Code)/i)
  const solutionText = solutionStart !== -1 ? text.slice(solutionStart) : text

  return {
    strategyHtml: renderMarkdown(strategyText),
    solutionHtml: renderMarkdown(solutionText)
  }
}

/**
 * Reliable markdown → HTML for overlay cards.
 * Protects code fences so newlines inside code are never turned into <br>.
 * @param {string} text
 * @returns {string}
 */
function renderMarkdown(text) {
  if (!text) return ''

  const placeholders = []
  const stash = (html) => {
    const key = `@@CMBLOCK${placeholders.length}@@`
    placeholders.push(html)
    return key
  }

  let html = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Fenced code blocks first
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || 'plaintext'
    const trimmed = code.replace(/^\n+|\n+$/g, '')
    return stash(`<div class="code-block-wrapper">
      <div class="code-block-header">
        <span>${language}</span>
        <button class="code-copy-btn" data-code="${encodeURIComponent(trimmed)}">Copy Code</button>
      </div>
      <pre><code class="language-${language}">${trimmed}</code></pre>
    </div>`)
  })

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${code}</code>`))

  // Split into blocks on blank lines for cleaner paragraphs/lists
  const blocks = html.split(/\n{2,}/)
  const renderedBlocks = blocks.map(block => {
    const trimmed = block.trim()
    if (!trimmed) return ''

    // Already a stashed block (code)
    if (/^@@CMBLOCK\d+@@$/.test(trimmed)) return trimmed

    // Headers
    if (/^###\s+/.test(trimmed)) {
      return trimmed.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    }
    if (/^##\s+/.test(trimmed)) {
      return trimmed.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    }

    const lines = trimmed.split('\n')

    // Unordered list block
    if (lines.every(l => /^[-*]\s+/.test(l.trim()) || !l.trim())) {
      const items = lines
        .filter(l => l.trim())
        .map(l => `<li>${formatInline(l.replace(/^[-*]\s+/, ''))}</li>`)
        .join('')
      return `<ul>${items}</ul>`
    }

    // Ordered list block
    if (lines.every(l => /^\d+\.\s+/.test(l.trim()) || !l.trim())) {
      const items = lines
        .filter(l => l.trim())
        .map(l => `<li>${formatInline(l.replace(/^\d+\.\s+/, ''))}</li>`)
        .join('')
      return `<ol>${items}</ol>`
    }

    // Mixed: convert list lines, keep other lines as text
    if (lines.some(l => /^[-*]\s+/.test(l.trim()) || /^\d+\.\s+/.test(l.trim()))) {
      let out = ''
      let listType = null
      let listItems = []

      const flushList = () => {
        if (!listType || listItems.length === 0) return
        out += listType === 'ol'
          ? `<ol>${listItems.join('')}</ol>`
          : `<ul>${listItems.join('')}</ul>`
        listType = null
        listItems = []
      }

      for (const line of lines) {
        const t = line.trim()
        if (/^[-*]\s+/.test(t)) {
          if (listType && listType !== 'ul') flushList()
          listType = 'ul'
          listItems.push(`<li>${formatInline(t.replace(/^[-*]\s+/, ''))}</li>`)
        } else if (/^\d+\.\s+/.test(t)) {
          if (listType && listType !== 'ol') flushList()
          listType = 'ol'
          listItems.push(`<li>${formatInline(t.replace(/^\d+\.\s+/, ''))}</li>`)
        } else {
          flushList()
          if (t) out += `<p>${formatInline(t)}</p>`
        }
      }
      flushList()
      return out
    }

    // Normal paragraph - preserve soft line breaks as spaces for readability
    // (interview answers should read as prose, not one-word-per-line)
    const prose = lines.map(l => l.trim()).filter(Boolean).join(' ')
    return `<p>${formatInline(prose)}</p>`
  }).filter(Boolean)

  html = renderedBlocks.join('\n')

  // Restore stashed blocks
  html = html.replace(/@@CMBLOCK(\d+)@@/g, (_, i) => placeholders[Number(i)] || '')

  return html
}

/**
 * Inline markdown (bold/italic) after block parsing
 * @param {string} text
 * @returns {string}
 */
function formatInline(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)(?!\s)\*(?!\*)/g, '$1<em>$2</em>')
}

/**
 * Set up copy buttons inside code blocks
 * @param {HTMLElement} container - Container element with code blocks
 */
function setupCodeCopyButtons(container) {
  container.querySelectorAll('.code-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = decodeURIComponent(btn.dataset.code || '')
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = 'Copied!'
        btn.classList.add('copied')
        setTimeout(() => {
          btn.textContent = 'Copy Code'
          btn.classList.remove('copied')
        }, 2000)
      })
    })
  })
}

// ═══ Chat ═══

/**
 * Send chat question about the last screen capture
 */
async function sendChatQuestion() {
  const question = chatInput.value.trim()
  if (!question) return

  chatInput.value = ''
  chatSendBtn.disabled = true
  showStatus('Thinking...')

  // Show the question as a user message card
  addUserMessageCard(question)

  try {
    const result = await window.cluemind.askAboutScreen(question)
    if (!result.success) {
      showStatus(result.error, true)
      setTimeout(() => hideStatus(), 3000)
    } else {
      hideStatus()
    }
  } catch (err) {
    showStatus('Error: ' + err.message, true)
    setTimeout(() => hideStatus(), 3000)
  } finally {
    chatSendBtn.disabled = false
    chatInput.focus()
  }
}

/**
 * Add a user question card to the suggestions panel
 */
function addUserMessageCard(text) {
  suggestionsEmpty.style.display = 'none'
  const card = document.createElement('div')
  card.className = 'suggestion-card user-message'
  card.innerHTML = `
    <div class="card-header">
      <div class="card-type">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2e6dff" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        You
      </div>
    </div>
    <div class="card-body"><p>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p></div>
  `
  suggestionsScroll.insertBefore(card, suggestionsScroll.firstChild)
}

// ═══ Screen Capture ═══

/**
 * Trigger a screen capture and AI analysis
 */
async function captureScreen() {
  showStatus('Capturing screen...')
  captureScreenBtn.disabled = true

  try {
    showStatus('Analyzing with AI...')
    const result = await window.cluemind.captureScreen()
    if (result.success) {
      showStatus('Screen analyzed!')
      setTimeout(() => hideStatus(), 2000)
    } else {
      showStatus(result.error || 'Screen capture failed', true)
    }
  } catch (err) {
    showStatus('Screen capture error: ' + err.message, true)
  } finally {
    captureScreenBtn.disabled = false
  }
}

// ═══ Minimize / Expand ═══

/**
 * Minimize overlay to floating pill
 */
function minimizeOverlay() {
  isMinimized = true
  overlayContainer.style.display = 'none'
  minimizedPill.style.display = 'flex'
}

/**
 * Expand overlay from floating pill
 */
function expandOverlay() {
  isMinimized = false
  overlayContainer.style.display = 'flex'
  minimizedPill.style.display = 'none'
}

// ═══ Settings ═══

/**
 * Open the settings window
 */
async function openSettings() {
  try {
    showStatus('Opening settings...')
    const result = await window.cluemind.openSettings()
    if (result && result.success === false) {
      showStatus(result.error || 'Could not open settings', true)
      return
    }
    hideStatus()
  } catch (err) {
    console.error('Failed to open settings:', err)
    showStatus('Failed to open settings: ' + err.message, true)
  }
}

// ═══ Status ═══

/**
 * Show a status message in the status bar
 * @param {string} message - Status message
 * @param {boolean} isError - Whether this is an error
 */
function showStatus(message, isError = false) {
  statusBar.style.display = 'block'
  statusText.textContent = message
  statusBar.style.background = isError
    ? 'rgba(239, 68, 68, 0.1)'
    : 'rgba(46, 109, 255), 0.08)'
  statusText.style.color = isError ? '#EF4444' : 'var(--muted)'
}

/**
 * Hide the status bar
 */
function hideStatus() {
  statusBar.style.display = 'none'
}

// ═══ Start ═══
init()
