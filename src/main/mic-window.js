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
    x: -10000,
    y: -10000,
    show: true,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, '../preload/mic.js')
    }
  })
  // Keep it out of the user's way while still allowing getDisplayMedia to start.
  micWindow.setIgnoreMouseEvents(true)
  micWindow.setContentProtection(true)
  micWindow.setSkipTaskbar(true)
  // Do not float above everything - reduces chance of appearing in shares
  micWindow.setAlwaysOnTop(false)

  if (process.env.ELECTRON_RENDERER_URL) {
    micWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/mic/index.html`)
  } else {
    micWindow.loadFile(path.join(__dirname, '../renderer/mic/index.html'))
  }

  micWindow.on('closed', () => {
    micWindow = null
  })

  let crashCount = 0
  micWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Mic window renderer crashed:', details.reason)
    micWindow = null
    crashCount++
    if (crashCount <= 3) {
      setTimeout(() => {
        console.log(`Restarting mic capture after crash (attempt ${crashCount}/3)...`)
        startMicCapture()
      }, 1000 * crashCount)
    } else {
      console.error('Mic window crashed too many times, giving up')
    }
  })

  return micWindow
}

/**
 * Get the mic window instance
 */
function getMicWindow() {
  return micWindow
}

/**
 * Start audio capture by sending START_MIC to the hidden mic window.
 * Uses desktopCapturer - no device selection needed.
 */
function startMicCapture(opts = {}) {
  const win = createMicWindow()
  const sendStart = () => {
    console.log('Mic window loaded, sending START_MIC', opts)
    win.webContents.send('START_MIC', opts)
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', sendStart)
  } else {
    sendStart()
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

export { createMicWindow, getMicWindow, startMicCapture, stopMicCapture, destroyMicWindow }
