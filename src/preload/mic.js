const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('micBridge', {
  sendAudioData: (chunk) => ipcRenderer.send('SEND_AUDIO_DATA', chunk),
  micReady: () => ipcRenderer.send('MIC_READY'),
  micError: (msg) => ipcRenderer.send('MIC_ERROR', msg),
  onStartMic: (callback) => ipcRenderer.on('START_MIC', () => callback()),
  onStopMic: (callback) => ipcRenderer.on('STOP_MIC', () => callback())
})
