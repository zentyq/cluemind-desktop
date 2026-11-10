import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { resolveAppIcon } from './app-icon'

/** @type {BrowserWindow|null} */
let overlayWindow = null
/** True when mouse clicks pass through the overlay so cursor movement/clicks are never needed */
let clickThroughEnabled = true

/**
 * Create the overlay window with stealth flags
 * @returns {BrowserWindow} The created overlay window
 */
function createOverlayWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize
  const icon = resolveAppIcon()

  overlayWindow = new BrowserWindow({
    width: 440,
    height: 700,
    x: screenWidth - 460,
    y: 20,
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: !clickThroughEnabled,
    resizable: true,
    hasShadow: true,
    backgroundColor: '#050814',
    ...(icon ? { icon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  })

  if (icon) overlayWindow.setIcon(icon)
  // Make invisible during screen sharing (Zoom/Meet/Teams desktop capture)
  overlayWindow.setContentProtection(true)
  overlayWindow.setSkipTaskbar(true)

  // Default to stealth click-through so mouse never interacts with overlay on shared screens
  if (clickThroughEnabled) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  }

  // Mac-specific adjustments
  if (process.platform === 'darwin') {
    overlayWindow.setWindowButtonVisibility(false)
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)

  // Re-apply protection if the OS resets it after show/hide
  overlayWindow.on('show', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setContentProtection(true)
      overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      if (clickThroughEnabled) {
        overlayWindow.setIgnoreMouseEvents(true, { forward: true })
      }
    }
  })

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
 * Toggle overlay window visibility without stealing focus from the interview window
 */
function toggleOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow()
    return
  }

  if (overlayWindow.isVisible()) {
    overlayWindow.hide()
  } else {
    overlayWindow.showInactive()
    overlayWindow.setContentProtection(true)
    overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    if (clickThroughEnabled) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    }
  }
}

/**
 * Get the overlay window instance
 * @returns {BrowserWindow|null}
 */
function getOverlayWindow() {
  return overlayWindow
}

function setOverlayOpacity(value) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return 1
  const next = Math.min(1, Math.max(0.35, Number(value) || 1))
  overlayWindow.setOpacity(next)
  return next
}

function setOverlayClickThrough(on) {
  clickThroughEnabled = Boolean(on)
  if (!overlayWindow || overlayWindow.isDestroyed()) return clickThroughEnabled
  try {
    overlayWindow.setFocusable(!clickThroughEnabled)
  } catch (_) { /* ignore */ }
  overlayWindow.setIgnoreMouseEvents(clickThroughEnabled, { forward: true })
  if (!clickThroughEnabled && overlayWindow.isVisible()) {
    overlayWindow.focus()
  }
  return clickThroughEnabled
}

function getOverlayClickThrough() {
  return clickThroughEnabled
}

function nudgeOverlayOpacity(delta) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return 1
  return setOverlayOpacity(overlayWindow.getOpacity() + delta)
}

function nudgeOverlayPosition(dx = 0, dy = 0) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return null
  const bounds = overlayWindow.getBounds()
  const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay()
  const area = display.workArea
  const nextX = Math.max(area.x, Math.min(area.x + area.width - bounds.width, bounds.x + dx))
  const nextY = Math.max(area.y, Math.min(area.y + area.height - bounds.height, bounds.y + dy))
  overlayWindow.setPosition(Math.round(nextX), Math.round(nextY), false)
  return { x: nextX, y: nextY }
}

export {
  createOverlayWindow,
  toggleOverlay,
  getOverlayWindow,
  setOverlayOpacity,
  setOverlayClickThrough,
  getOverlayClickThrough,
  nudgeOverlayOpacity,
  nudgeOverlayPosition
}
