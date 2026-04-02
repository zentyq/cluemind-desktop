import { BrowserWindow, screen } from 'electron'
import path from 'path'

/** @type {BrowserWindow|null} */
let overlayWindow = null

/**
 * Create the overlay window with stealth flags
 * @returns {BrowserWindow} The created overlay window
 */
function createOverlayWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

  overlayWindow = new BrowserWindow({
    width: 420,
    height: 680,
    x: screenWidth - 440,
    y: 20,
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: true,
    backgroundColor: '#0A0A0F',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  })

  // Make invisible to screen capture
  overlayWindow.setContentProtection(true)

  // Mac-specific adjustments
  if (process.platform === 'darwin') {
    overlayWindow.setWindowButtonVisibility(false)
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)

  if (process.env.ELECTRON_RENDERER_URL) {
    overlayWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay/index.html`)
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay/index.html'))
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  overlayWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer crashed:', details.reason)
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.destroy()
    }
    overlayWindow = null
    // Auto-recreate after a short delay
    setTimeout(() => createOverlayWindow(), 1000)
  })

  return overlayWindow
}

/**
 * Toggle overlay window visibility
 */
function toggleOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow()
    return
  }

  if (overlayWindow.isVisible()) {
    overlayWindow.hide()
  } else {
    overlayWindow.show()
    overlayWindow.focus()
  }
}

/**
 * Get the overlay window instance
 * @returns {BrowserWindow|null}
 */
function getOverlayWindow() {
  return overlayWindow
}

export { createOverlayWindow, toggleOverlay, getOverlayWindow }
