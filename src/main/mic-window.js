import { BrowserWindow } from 'electron'
import path from 'path'

/** @type {BrowserWindow|null} */
let micWindow = null

/**
 * Create a hidden window dedicated to microphone capture.
 * This window has no special flags (no content protection, no alwaysOnTop)
 * so getUserMedia works reliably on Windows.
 */
function createMicWindow() {
  if (micWindow && !micWindow.isDestroyed()) {
    return micWindow
  }

  micWindow = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, '../preload/mic.js')
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    micWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/mic/index.html`)
  } else {
    micWindow.loadFile(path.join(__dirname, '../renderer/mic/index.html'))
  }

  micWindow.on('closed', () => {
    micWindow = null
  })

  micWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Mic window renderer crashed:', details.reason)
    micWindow = null
    // Auto-restart mic capture after crash
    setTimeout(() => {
      console.log('Restarting mic capture after crash...')
      startMicCapture()
    }, 1000)
  })

  return micWindow
}

/**
 * Start microphone capture by sending START_MIC to the hidden mic window
 */
function startMicCapture() {
  const win = createMicWindow()
  // Wait for the page to finish loading before sending the message
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      console.log('Mic window loaded, sending START_MIC')
      win.webContents.send('START_MIC')
    })
  } else {
    console.log('Mic window ready, sending START_MIC')
    win.webContents.send('START_MIC')
  }
}

/**
 * Stop microphone capture
 */
function stopMicCapture() {
  if (micWindow && !micWindow.isDestroyed()) {
    micWindow.webContents.send('STOP_MIC')
  }
}

/**
 * Destroy the mic window
 */
function destroyMicWindow() {
  if (micWindow && !micWindow.isDestroyed()) {
    micWindow.destroy()
    micWindow = null
  }
}

export { createMicWindow, startMicCapture, stopMicCapture, destroyMicWindow }
