/**
 * ClueMind AI Assistant - Settings Window Logic
 * Handles API key management and preference configuration
 */

// ═══ DOM Elements ═══
const geminiKeyInput = document.getElementById('geminiKey')
const deepgramKeyInput = document.getElementById('deepgramKey')
const defaultModeSelect = document.getElementById('defaultMode')
const interviewLanguageSelect = document.getElementById('interviewLanguage')
const saveBtn = document.getElementById('saveBtn')
const cancelBtn = document.getElementById('cancelBtn')
const closeBtn = document.getElementById('closeBtn')
const testGeminiBtn = document.getElementById('testGeminiBtn')
const testDeepgramBtn = document.getElementById('testDeepgramBtn')
const geminiTestResult = document.getElementById('geminiTestResult')
const deepgramTestResult = document.getElementById('deepgramTestResult')

// ═══ Initialization ═══

/**
 * Load saved settings and populate form fields
 */
async function loadSettings() {
  try {
    const settings = await window.cluemind.getSettings()
    geminiKeyInput.value = settings.geminiApiKey || ''
    deepgramKeyInput.value = settings.deepgramApiKey || ''
    defaultModeSelect.value = settings.defaultMode || 'meeting'
    interviewLanguageSelect.value = settings.interviewLanguage || 'javascript'
  } catch (err) {
    console.error('Failed to load settings:', err)
  }
}

// ═══ Event Listeners ═══

/**
 * Save settings to electron-store
 */
saveBtn.addEventListener('click', async () => {
  const settings = {
    geminiApiKey: geminiKeyInput.value.trim(),
    deepgramApiKey: deepgramKeyInput.value.trim(),
    defaultMode: defaultModeSelect.value,
    interviewLanguage: interviewLanguageSelect.value
  }

  try {
    await window.cluemind.saveSettings(settings)
    saveBtn.textContent = 'Saved!'
    saveBtn.classList.add('saved')
    setTimeout(() => {
      saveBtn.textContent = 'Save Settings'
      saveBtn.classList.remove('saved')
    }, 2000)
  } catch (err) {
    console.error('Failed to save settings:', err)
    saveBtn.textContent = 'Error!'
    setTimeout(() => {
      saveBtn.textContent = 'Save Settings'
    }, 2000)
  }
})

/**
 * Cancel and close settings window
 */
cancelBtn.addEventListener('click', () => {
  window.cluemind.closeWindow()
})

/**
 * Close settings window via X button
 */
closeBtn.addEventListener('click', () => {
  window.cluemind.closeWindow()
})

/**
 * Toggle password visibility for API key inputs
 */
document.querySelectorAll('.toggle-vis-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target
    const input = document.getElementById(targetId)
    if (input.type === 'password') {
      input.type = 'text'
      btn.textContent = 'Hide'
    } else {
      input.type = 'password'
      btn.textContent = 'Show'
    }
  })
})

/**
 * Test Gemini API connection
 */
testGeminiBtn.addEventListener('click', async () => {
  const apiKey = geminiKeyInput.value.trim()
  if (!apiKey) {
    showTestResult(geminiTestResult, 'Please enter an API key first.', false)
    return
  }

  testGeminiBtn.textContent = 'Testing...'
  testGeminiBtn.disabled = true

  try {
    const result = await window.cluemind.testGemini(apiKey)
    if (result.success) {
      showTestResult(geminiTestResult, result.message, true)
      testGeminiBtn.classList.add('success')
    } else {
      showTestResult(geminiTestResult, result.error, false)
      testGeminiBtn.classList.add('error')
    }
  } catch (err) {
    showTestResult(geminiTestResult, 'Test failed: ' + err.message, false)
  } finally {
    testGeminiBtn.textContent = 'Test'
    testGeminiBtn.disabled = false
    setTimeout(() => {
      testGeminiBtn.classList.remove('success', 'error')
    }, 3000)
  }
})

/**
 * Test Deepgram API connection
 */
testDeepgramBtn.addEventListener('click', async () => {
  const apiKey = deepgramKeyInput.value.trim()
  if (!apiKey) {
    showTestResult(deepgramTestResult, 'Please enter an API key first.', false)
    return
  }

  testDeepgramBtn.textContent = 'Testing...'
  testDeepgramBtn.disabled = true

  try {
    const result = await window.cluemind.testDeepgram(apiKey)
    if (result.success) {
      showTestResult(deepgramTestResult, result.message, true)
      testDeepgramBtn.classList.add('success')
    } else {
      showTestResult(deepgramTestResult, result.error, false)
      testDeepgramBtn.classList.add('error')
    }
  } catch (err) {
    showTestResult(deepgramTestResult, 'Test failed: ' + err.message, false)
  } finally {
    testDeepgramBtn.textContent = 'Test'
    testDeepgramBtn.disabled = false
    setTimeout(() => {
      testDeepgramBtn.classList.remove('success', 'error')
    }, 3000)
  }
})

/**
 * Show a test result message
 * @param {HTMLElement} el - Result element
 * @param {string} message - Message to display
 * @param {boolean} success - Whether the test was successful
 */
function showTestResult(el, message, success) {
  el.textContent = message
  el.className = 'test-result ' + (success ? 'success' : 'error')
  setTimeout(() => {
    el.style.display = 'none'
    el.className = 'test-result'
  }, 5000)
}

// ═══ Start ═══
loadSettings()
