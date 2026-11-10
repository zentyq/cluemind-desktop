const { contextBridge, ipcRenderer } = require('electron')

let chunkCount = 0

contextBridge.exposeInMainWorld('micBridge', {
  sendAudioData: (chunk) => {
    // Copy only the typed-array view bytes (not a larger underlying ArrayBuffer).
    const view = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk.buffer || chunk)
    const buf = Buffer.from(view.buffer, view.byteOffset, view.byteLength)
    chunkCount++
    if (chunkCount % 20 === 1) {
      console.log(`[mic-preload] chunk #${chunkCount}, size: ${buf.byteLength}`)
    }
    ipcRenderer.send('SEND_AUDIO_DATA', buf)
  },
  sendSampleRate: (rate) => ipcRenderer.send('AUDIO_SAMPLE_RATE', rate),
  micReady: (mode) => ipcRenderer.send('MIC_READY', mode || 'unknown'),
  micError: (msg) => ipcRenderer.send('MIC_ERROR', msg),
  onStartMic: (callback) => ipcRenderer.on('START_MIC', (_e, opts) => callback(opts || {})),
  onStopMic: (callback) => ipcRenderer.on('STOP_MIC', () => callback())
})
