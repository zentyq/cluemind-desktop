import WebSocket from 'ws'

let dgSocket = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5
let isCapturing = false
let chunksSent = 0
let currentSampleRate = 16000
let currentLanguage = 'en'
let deepgramApiKey = null
let transcriptCallback = null
let connectedSampleRate = null

function setSampleRate(rate) {
  const next = Number(rate) || 16000
  if (next === currentSampleRate) return
  currentSampleRate = next
  console.log(`[deepgram] Sample rate set to ${next}`)

  // Deepgram was likely opened with the default rate before AudioContext reported
  // the real hardware rate - reconnect so encoding matches the PCM we send.
  if (isCapturing && deepgramApiKey && transcriptCallback && connectedSampleRate !== next) {
    console.log(`[deepgram] Reconnecting to apply sample_rate=${next}`)
    connectDeepgram(deepgramApiKey, transcriptCallback)
  }
}

function connectDeepgram(apiKey, onTranscript) {
  if (dgSocket) {
    if (dgSocket._keepalive) clearInterval(dgSocket._keepalive)
    try {
      dgSocket.removeAllListeners()
      if (dgSocket.readyState === WebSocket.OPEN || dgSocket.readyState === WebSocket.CONNECTING) {
        dgSocket.close()
      }
    } catch (_) {
      // ignore close errors during reconnect
    }
    dgSocket = null
  }

  deepgramApiKey = apiKey
  transcriptCallback = onTranscript
  connectedSampleRate = currentSampleRate

  const lang = encodeURIComponent(currentLanguage || 'en')
  const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=${lang}&punctuate=true&interim_results=true&smart_format=true&encoding=linear16&sample_rate=${currentSampleRate}&channels=1&endpointing=300`

  console.log(`[deepgram] Connecting with encoding=linear16, sample_rate=${currentSampleRate}`)

  dgSocket = new WebSocket(wsUrl, {
    headers: { Authorization: `Token ${apiKey}` }
  })

  dgSocket.on('open', () => {
    console.log('[deepgram] WebSocket connected')
    reconnectAttempts = 0
  })

  dgSocket.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString())
      if (response.type === 'Error' || response.error) {
        console.error('[deepgram] Error:', JSON.stringify(response))
        return
      }
      const transcript = response?.channel?.alternatives?.[0]?.transcript
      if (transcript && transcript.trim()) {
        onTranscript({
          text: transcript.trim(),
          isFinal: response.is_final === true,
          timestamp: Date.now(),
          confidence: response?.channel?.alternatives?.[0]?.confidence || 0
        })
      }
    } catch (err) {
      console.error('[deepgram] Parse error:', err)
    }
  })

  dgSocket.on('close', (code, reason) => {
    console.log(`[deepgram] Closed: ${code} ${reason}`)
    if (dgSocket && dgSocket._keepalive) clearInterval(dgSocket._keepalive)
    if (isCapturing && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
      reconnectAttempts++
      console.log(`[deepgram] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
      setTimeout(() => {
        if (isCapturing) connectDeepgram(apiKey, onTranscript)
      }, delay)
    }
  })

  dgSocket.on('error', (err) => {
    console.error('[deepgram] Error:', err.message)
  })
}

function startAudioCapture(apiKey, onTranscript, language = 'en') {
  if (isCapturing) return
  isCapturing = true
  reconnectAttempts = 0
  chunksSent = 0
  currentLanguage = language || 'en'
  connectDeepgram(apiKey, onTranscript)
}

function sendAudioChunk(chunk) {
  if (dgSocket && dgSocket.readyState === WebSocket.OPEN) {
    dgSocket.send(chunk)
    chunksSent++
    if (chunksSent % 20 === 1) {
      console.log(`[deepgram] Sent chunk #${chunksSent}, size: ${chunk.byteLength}`)
    }
    if (chunksSent === 1 && !dgSocket._keepalive) {
      dgSocket._keepalive = setInterval(() => {
        if (dgSocket && dgSocket.readyState === WebSocket.OPEN) {
          dgSocket.send(JSON.stringify({ type: 'KeepAlive' }))
        }
      }, 8000)
    }
  }
}

function stopAudioCapture() {
  isCapturing = false
  if (dgSocket) {
    if (dgSocket._keepalive) clearInterval(dgSocket._keepalive)
    try {
      if (dgSocket.readyState === WebSocket.OPEN) {
        dgSocket.send(JSON.stringify({ type: 'CloseStream' }))
      }
      dgSocket.close()
    } catch (err) {
      console.error('[deepgram] Close error:', err.message)
    }
    dgSocket = null
  }
  reconnectAttempts = 0
  chunksSent = 0
  connectedSampleRate = null
}

export { startAudioCapture, stopAudioCapture, sendAudioChunk, setSampleRate, connectDeepgram }
