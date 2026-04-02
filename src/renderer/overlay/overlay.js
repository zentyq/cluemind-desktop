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
const settingsHeaderBtn = document.getElementById('settingsHeaderBtn')
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
const modeTabs = document.querySelectorAll('.mode-tab')
const chatInput = document.getElementById('chatInput')
const chatSendBtn = document.getElementById('chatSendBtn')

// ═══ Initialization ═══

/**
 * Initialize the overlay application
 */
async function init() {
  await checkApiKeys()
  await loadSessionState()
  setupEventListeners()
  setupIpcListeners()
}

/**
 * Check if API keys are configured and show banner if not
 */
async function checkApiKeys() {
  try {
    const settings = await window.cluemind.getSettings()
    if (!settings.geminiApiKey || !settings.deepgramApiKey) {
      apiBanner.style.display = 'flex'
    } else {
      apiBanner.style.display = 'none'
    }
    if (settings.defaultMode) {
      currentMode = settings.defaultMode
      updateModeUI(currentMode)
    }
  } catch (err) {
    console.error('Failed to check API keys:', err)
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
  // Toggle session
  toggleSessionBtn.addEventListener('click', toggleSession)

  // Capture screen
  captureScreenBtn.addEventListener('click', captureScreen)

  // Clear chat
  clearChatBtn.addEventListener('click', clearAll)

  // Settings buttons
  settingsBtn.addEventListener('click', openSettings)
  if (settingsHeaderBtn) settingsHeaderBtn.addEventListener('click', openSettings)
  bannerSettingsBtn.addEventListener('click', openSettings)

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

  // Mode tabs
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode
      switchMode(mode)
    })
  })
}

/**
 * Set up IPC event listeners from main process
 */
function setupIpcListeners() {
  // Transcript updates
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
      showStatus('Session active — mic starting...')
      setTimeout(() => {
        if (isSessionActive) showStatus('Session active — listening...')
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
    showStatus('Session ended')
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
  } catch (err) {
    console.error('Failed to update mode:', err)
  }
}

/**
 * Update mode tab UI
 * @param {string} activeMode - The active mode
 */
function updateModeUI(activeMode) {
  modeTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === activeMode)
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

  const card = document.createElement('div')
  card.className = 'suggestion-card'

  // Determine card type icon and label
  const typeConfig = getTypeConfig(data.type)

  // Parse the suggestion text
  const isInterview = data.type === 'interview-help'
  let bodyHtml = ''

  if (isInterview && data.suggestion) {
    // Split into strategy and full solution for interview mode
    const { strategyHtml, solutionHtml } = parseInterviewResponse(data.suggestion)
    const cardId = `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    bodyHtml = `
      <div class="strategy-hint">${strategyHtml}</div>
      <button class="expand-toggle" data-target="${cardId}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        Show Full Solution
      </button>
      <div class="full-solution" id="${cardId}">${solutionHtml}</div>
    `
  } else {
    bodyHtml = renderMarkdown(data.suggestion || '')
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

  // Add copy button handler
  const copyBtn = card.querySelector('.card-copy-btn')
  copyBtn.addEventListener('click', () => {
    const textToCopy = data.code || data.suggestion || ''
    navigator.clipboard.writeText(textToCopy).then(() => {
      copyBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`
      copyBtn.classList.add('copied')
      setTimeout(() => {
        copyBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`
        copyBtn.classList.remove('copied')
      }, 2000)
    })
  })

  // Add expand toggle handler for interview cards
  const expandToggle = card.querySelector('.expand-toggle')
  if (expandToggle) {
    expandToggle.addEventListener('click', () => {
      const targetId = expandToggle.dataset.target
      const target = document.getElementById(targetId)
      if (target) {
        const isVisible = target.classList.contains('visible')
        target.classList.toggle('visible')
        expandToggle.classList.toggle('expanded')
        expandToggle.querySelector('svg').nextSibling.textContent =
          isVisible ? ' Show Full Solution' : ' Hide Solution'
      }
    })
  }

  // Add code copy buttons
  setupCodeCopyButtons(card)

  suggestionsScroll.insertBefore(card, suggestionsScroll.firstChild)

  // Highlight code blocks
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
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      label: 'Meeting Insight'
    },
    'interview': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
      label: 'Interview Help'
    },
    'interview-help': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      label: 'Solution'
    },
    'screen': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
      label: 'Screen Analysis'
    },
    'screen-analysis': {
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      label: 'Screen Analysis'    },
    'chat-answer': {
      icon: '<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#10B981\" stroke-width=\"2\"><path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"/></svg>',
      label: 'Answer'    }
  }

  return configs[type] || configs['meeting']
}

/**
 * Parse an interview response into strategy hint and full solution
 * @param {string} text - Raw response text
 * @returns {{strategyHtml: string, solutionHtml: string}}
 */
function parseInterviewResponse(text) {
  // Try to split by Strategy/Solution headers
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
 * Simple markdown to HTML renderer
 * @param {string} text - Markdown text
 * @returns {string} HTML string
 */
function renderMarkdown(text) {
  if (!text) return ''

  let html = text
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks (must be before other processing)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || 'plaintext'
    return `<div class="code-block-wrapper">
      <div class="code-block-header">
        <span>${language}</span>
        <button class="code-copy-btn" data-code="${encodeURIComponent(code.trim())}">Copy Code</button>
      </div>
      <pre><code class="language-${language}">${code.trim()}</code></pre>
    </div>`
  })

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')

  // Line breaks for remaining text
  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br>')

  // Wrap in paragraph if not starting with a block element
  if (!html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<div')) {
    html = '<p>' + html + '</p>'
  }

  return html
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
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
    await window.cluemind.openSettings()
  } catch (err) {
    console.error('Failed to open settings:', err)
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
    : 'rgba(124, 58, 237, 0.08)'
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
