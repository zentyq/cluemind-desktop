import WebSocket from 'ws'

/** @type {WebSocket|null} */
let dgSocket = null

/** @type {number} */
let reconnectAttempts = 0

/** @type {number} */
const MAX_RECONNECT_ATTEMPTS = 5

/** @type {boolean} */
let isCapturing = false

/** @type {string|null} */
let currentApiKey = null

/** @type {Function|null} */
let currentCallback = null

/**
 * Connect to Deepgram WebSocket for real-time transcription
 * @param {string} apiKey - Deepgram API key
 * @param {Function} onTranscript - Callback for transcript updates
 */
function connectDeepgram(apiKey, onTranscript) {
  if (dgSocket && dgSocket.readyState === WebSocket.OPEN) {
    dgSocket.close()
  }

  const wsUrl = 'wss://api.deepgram.com/v1/listen?language=en&punctuate=true&interim_results=true&smart_format=true&encoding=linear16&sample_rate=16000&channels=1'

  dgSocket = new WebSocket(wsUrl, {
    headers: {
      Authorization: `Token ${apiKey}`
    }
  })

  dgSocket.on('open', () => {
    console.log('Deepgram WebSocket connected')
    reconnectAttempts = 0
  })

  dgSocket.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString())
      const transcript = response?.channel?.alternatives?.[0]?.transcript

      if (transcript && transcript.trim()) {
        const isFinal = response.is_final === true
        onTranscript({
          text: transcript.trim(),
          isFinal,
          timestamp: Date.now(),
          confidence: response?.channel?.alternatives?.[0]?.confidence || 0
        })
      }
    } catch (err) {
      console.error('Error parsing Deepgram response:', err)
    }
  })

  dgSocket.on('close', (code, reason) => {
    console.log(`Deepgram WebSocket closed: ${code} ${reason}`)
    if (isCapturing && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
      reconnectAttempts++
      console.log(`Reconnecting to Deepgram in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)
      setTimeout(() => {
        if (isCapturing) {
          connectDeepgram(apiKey, onTranscript)
        }
      }, delay)
    }
  })

  dgSocket.on('error', (err) => {
    console.error('Deepgram WebSocket error:', err.message)
  })
}

/**
 * Start a Deepgram session (audio will come from renderer via IPC)
 * @param {string} deepgramApiKey - Deepgram API key
 * @param {Function} onTranscript - Callback receiving transcript objects
 */
function startAudioCapture(deepgramApiKey, onTranscript) {
  if (isCapturing) {
    console.warn('Audio capture already active')
    return
  }

  isCapturing = true
  currentApiKey = deepgramApiKey
  currentCallback = onTranscript
  reconnectAttempts = 0

  connectDeepgram(deepgramApiKey, onTranscript)
}

/**
 * Send audio data chunk to Deepgram (called from IPC with renderer audio)
 * @param {Buffer} chunk - Raw 16-bit PCM audio data
 */
function sendAudioChunk(chunk) {
  if (dgSocket && dgSocket.readyState === WebSocket.OPEN) {
    dgSocket.send(chunk)
  }
}

/**
 * Stop audio capture and close all connections
 */
function stopAudioCapture() {
  isCapturing = false

  if (dgSocket) {
    try {
      if (dgSocket.readyState === WebSocket.OPEN) {
        dgSocket.send(JSON.stringify({ type: 'CloseStream' }))
      }
      dgSocket.close()
    } catch (err) {
      console.error('Error closing Deepgram socket:', err.message)
    }
    dgSocket = null
  }

  currentApiKey = null
  currentCallback = null
  reconnectAttempts = 0
}

export { startAudioCapture, stopAudioCapture, sendAudioChunk, connectDeepgram }
