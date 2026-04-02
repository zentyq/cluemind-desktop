import { app, BrowserWindow, globalShortcut, screen, session } from 'electron'
import path from 'path'
import { createOverlayWindow, toggleOverlay, getOverlayWindow } from './overlay'
import { createTray } from './tray'
import { registerIpcHandlers } from './ipc-handlers'

// Prevent app from crashing on uncaught errors (e.g. missing SoX)
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message)
})
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})

// Disable hardware acceleration to prevent renderer crash with getUserMedia
app.disableHardwareAcceleration()

/** @type {BrowserWindow|null} */
let settingsWindow = null

/** Application session state */
const sessionState = {
  isActive: false,
  mode: 'meeting',
  transcript: [],
  suggestions: [],
  startTime: null,
  overlayVisible: false
}

/**
 * Get the current session state
 * @returns {object} The current session state
 */
function getSessionState() {
  return sessionState
}

/**
 * Update the session state
 * @param {object} updates - Partial state updates
 */
function updateSessionState(updates) {
  Object.assign(sessionState, updates)
}

/**
 * Create the settings window
 */
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 640,
    x: Math.round((screenWidth - 520) / 2),
    y: Math.round((screenHeight - 640) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    settingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings/index.html`)
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../renderer/settings/index.html'))
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

/**
 * Initialize the application
 */
function initApp() {
  // Auto-grant microphone permission for getUserMedia
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'audio']
    if (allowed.includes(permission)) {
      console.log('Permission granted:', permission)
      callback(true)
    } else {
      console.log('Permission denied:', permission)
      callback(true) // grant all for now to avoid blocking
    }
  })
  session.defaultSession.setPermissionCheckHandler(() => true)

  createOverlayWindow()
  createTray(
    () => toggleOverlay(),
    () => {
      const overlay = getOverlayWindow()
      if (overlay) overlay.webContents.send('TOGGLE_SESSION')
    },
    () => createSettingsWindow(),
    () => app.quit()
  )
  registerIpcHandlers(sessionState, createSettingsWindow)

  globalShortcut.register('CommandOrControl+Shift+A', () => {
    toggleOverlay()
  })
}

app.whenReady().then(initApp)

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', (e) => {
  // Don't quit — tray keeps the app alive
})

export { getSessionState, updateSessionState, createSettingsWindow }
