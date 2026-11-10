import { app, BrowserWindow, globalShortcut, screen, session, desktopCapturer } from 'electron'
import path from 'path'
import {
  createOverlayWindow,
  toggleOverlay,
  getOverlayWindow,
  setOverlayClickThrough,
  getOverlayClickThrough,
  nudgeOverlayOpacity,
  nudgeOverlayPosition
} from './overlay'
import { createTray } from './tray'
import { registerIpcHandlers } from './ipc-handlers'
import { hasLicenseKey, ensureLicenseValid, clearLicense } from '../utils/cloud/license'
import { resolveAppIcon } from './app-icon'
import { startAutoUpdater } from './updater'

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
/** @type {BrowserWindow|null} */
let loginWindow = null
/** @type {BrowserWindow|null} */
let splashWindow = null
/** True once overlay/tray are running after a valid license */
let appUnlocked = false
/** User requested quit from license window */
let forceQuit = false

function windowIconOpts() {
  const icon = resolveAppIcon()
  return icon ? { icon } : {}
}

/** Application session state */
const sessionState = {
  isActive: false,
  mode: 'meeting',
  transcript: [],
  suggestions: [],
  memory: [],
  startTime: null,
  overlayVisible: false,
  cloudSttStartedAt: null,
  planStealth: false
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
  if (!appUnlocked) {
    createLoginWindow()
    return
  }

  try {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMinimized()) settingsWindow.restore()
      settingsWindow.show()
      settingsWindow.focus()
      settingsWindow.moveTop()
      return
    }

    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

    settingsWindow = new BrowserWindow({
      width: 480,
      height: 720,
      x: Math.round((screenWidth - 480) / 2),
      y: Math.round((screenHeight - 720) / 2),
      frame: false,
      transparent: false,
      backgroundColor: '#050814',
      resizable: true,
      skipTaskbar: false,
      alwaysOnTop: true,
      show: false,
      ...windowIconOpts(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: path.join(__dirname, '../preload/preload.js')
      }
    })
    settingsWindow.setContentProtection(true)
    settingsWindow.setAlwaysOnTop(true, 'screen-saver', 1)

    const showSettings = () => {
      if (!settingsWindow || settingsWindow.isDestroyed()) return
      settingsWindow.show()
      settingsWindow.focus()
      settingsWindow.moveTop()
    }

    // transparent/frameless windows on Windows often never fire ready-to-show
    settingsWindow.once('ready-to-show', showSettings)
    settingsWindow.webContents.once('did-finish-load', () => {
      // Fallback if ready-to-show never fires
      setTimeout(showSettings, 50)
    })
    settingsWindow.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error('[settings] failed to load:', code, desc)
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      settingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings/index.html`)
    } else {
      settingsWindow.loadFile(path.join(__dirname, '../renderer/settings/index.html'))
    }

    settingsWindow.on('closed', () => {
      settingsWindow = null
    })
  } catch (err) {
    console.error('[settings] createSettingsWindow error:', err)
  }
}

/**
 * Floating logo splash while the app boots / checks license.
 */
function createSplashWindow() {
  try {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.show()
      return
    }

    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
    splashWindow = new BrowserWindow({
      width: 320,
      height: 340,
      x: Math.round((screenWidth - 320) / 2),
      y: Math.round((screenHeight - 340) / 2),
      frame: false,
      transparent: false,
      backgroundColor: '#050814',
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      show: false,
      ...windowIconOpts(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })

    const showSplash = () => {
      if (!splashWindow || splashWindow.isDestroyed()) return
      splashWindow.show()
      splashWindow.focus()
    }
    splashWindow.once('ready-to-show', showSplash)
    splashWindow.webContents.once('did-finish-load', () => setTimeout(showSplash, 40))

    if (process.env.ELECTRON_RENDERER_URL) {
      splashWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/splash/index.html`)
    } else {
      splashWindow.loadFile(path.join(__dirname, '../renderer/splash/index.html'))
    }

    splashWindow.on('closed', () => {
      splashWindow = null
    })
  } catch (err) {
    console.error('[splash] createSplashWindow error:', err)
  }
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}

/**
 * License activation gate - shown before the rest of the app starts.
 * @param {{ change?: boolean }} [opts]
 */
function createLoginWindow(opts = {}) {
  try {
    const change = Boolean(opts.change)
    if (change) {
      try {
        clearLicense()
      } catch (_) { /* ignore */ }
    }

    const query = change ? '?change=1' : ''
    const loadLogin = (win) => {
      if (process.env.ELECTRON_RENDERER_URL) {
        win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/login/index.html${query}`)
      } else {
        win.loadFile(path.join(__dirname, '../renderer/login/index.html'), {
          search: change ? 'change=1' : ''
        })
      }
    }

    if (loginWindow && !loginWindow.isDestroyed()) {
      if (change) loadLogin(loginWindow)
      loginWindow.show()
      loginWindow.focus()
      loginWindow.moveTop()
      return
    }

    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

    loginWindow = new BrowserWindow({
      width: 440,
      height: 520,
      x: Math.round((screenWidth - 440) / 2),
      y: Math.round((screenHeight - 520) / 2),
      frame: false,
      transparent: false,
      backgroundColor: '#050814',
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      show: false,
      closable: true,
      ...windowIconOpts(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: path.join(__dirname, '../preload/preload.js')
      }
    })
    loginWindow.setContentProtection(true)
    loginWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    const icon = resolveAppIcon()
    if (icon) loginWindow.setIcon(icon)

    const showLogin = () => {
      if (!loginWindow || loginWindow.isDestroyed()) return
      loginWindow.show()
      loginWindow.focus()
      loginWindow.moveTop()
    }

    loginWindow.once('ready-to-show', showLogin)
    loginWindow.webContents.once('did-finish-load', () => {
      setTimeout(showLogin, 50)
    })

    loadLogin(loginWindow)

    loginWindow.on('closed', () => {
      loginWindow = null
      if (forceQuit || appUnlocked) return

      // Only start the app after a successful activation; otherwise quit
      ensureLicenseValid({ force: false })
        .then(() => startMainApp())
        .catch(() => {
          console.warn('[license] Activation window closed without a valid license - quitting')
          app.quit()
        })
    })
  } catch (err) {
    console.error('[login] createLoginWindow error:', err)
  }
}

function requestAppQuit() {
  forceQuit = true
  try {
    if (loginWindow && !loginWindow.isDestroyed()) loginWindow.destroy()
  } catch (_) { /* ignore */ }
  try {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy()
  } catch (_) { /* ignore */ }
  try {
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.destroy()
  } catch (_) { /* ignore */ }
  app.quit()
}

/**
 * Start overlay, tray, and shortcuts after license is valid.
 */
function startMainApp() {
  if (appUnlocked) return
  appUnlocked = true

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

  const sendHotkey = (action, extra = {}) => {
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('HOTKEY', { action, ...extra })
  }

  const reg = (accel, fn) => {
    try {
      globalShortcut.register(accel, fn)
    } catch (err) {
      console.warn('[hotkey] failed to register', accel, err?.message)
    }
  }

  // Visibility & Minimize (never steals focus)
  reg('CommandOrControl+Shift+A', () => toggleOverlay())
  reg('CommandOrControl+Shift+H', () => toggleOverlay())
  reg('CommandOrControl+Shift+Z', () => sendHotkey('toggle-minimize'))

  // Core Interview Actions (Zero Mouse Needed)
  reg('CommandOrControl+Shift+S', () => sendHotkey('toggle-session'))
  reg('CommandOrControl+Shift+Space', () => sendHotkey('ask-now'))
  reg('CommandOrControl+Return', () => sendHotkey('ask-now'))
  reg('CommandOrControl+Shift+X', () => sendHotkey('capture-screen'))
  reg('CommandOrControl+Shift+D', () => sendHotkey('capture-screen'))
  reg('CommandOrControl+Shift+R', () => sendHotkey('recap-session'))

  // Reading, Scrolling, Expanding & Copying (Zero Mouse Wheel / Clicks)
  reg('CommandOrControl+Shift+Up', () => sendHotkey('scroll', { delta: -160 }))
  reg('CommandOrControl+Shift+Down', () => sendHotkey('scroll', { delta: 160 }))
  reg('CommandOrControl+Shift+PageUp', () => sendHotkey('scroll', { delta: -380 }))
  reg('CommandOrControl+Shift+PageDown', () => sendHotkey('scroll', { delta: 380 }))
  reg('CommandOrControl+Shift+E', () => sendHotkey('toggle-expand'))
  reg('CommandOrControl+Shift+Y', () => sendHotkey('copy-latest'))
  reg('CommandOrControl+Shift+T', () => sendHotkey('toggle-panel'))
  reg('CommandOrControl+Shift+M', () => sendHotkey('cycle-mode'))
  reg('CommandOrControl+Shift+K', () => sendHotkey('clear-all'))

  // Reposition Overlay Window on Screen without Mouse Dragging
  reg('CommandOrControl+Alt+Up', () => nudgeOverlayPosition(0, -48))
  reg('CommandOrControl+Alt+Down', () => nudgeOverlayPosition(0, 48))
  reg('CommandOrControl+Alt+Left', () => nudgeOverlayPosition(-48, 0))
  reg('CommandOrControl+Alt+Right', () => nudgeOverlayPosition(48, 0))

  // Opacity & Settings
  reg('CommandOrControl+Shift+OpenBracket', () => {
    const opacity = nudgeOverlayOpacity(-0.1)
    sendHotkey('opacity', { opacity })
  })
  reg('CommandOrControl+Shift+CloseBracket', () => {
    const opacity = nudgeOverlayOpacity(0.1)
    sendHotkey('opacity', { opacity })
  })
  reg('CommandOrControl+Shift+Comma', () => {
    if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
      settingsWindow.hide()
    } else {
      createSettingsWindow()
    }
  })
  reg('CommandOrControl+Shift+O', () => {
    if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
      settingsWindow.hide()
    } else {
      createSettingsWindow()
    }
  })

  // Stealth Click-Through (No-Mouse Mode) — ON by default so cursor never interacts with overlay
  reg('CommandOrControl+Shift+C', () => {
    const next = !getOverlayClickThrough()
    setOverlayClickThrough(next)
    sendHotkey('click-through', { on: next })
  })

  console.log('[license] App unlocked - overlay ready')
  startAutoUpdater({
    onQuitForUpdate: () => { forceQuit = true }
  })
}

function handleAuthDeepLink(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'cluemind:') return
    const token = parsed.searchParams.get('token')
    if (!token) return
    import('../utils/cloud/client.js').then(async ({ loginWithToken: login }) => {
      await login(token)
      const overlay = getOverlayWindow()
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('AUTH_CHANGED', { loggedIn: true })
      }
    }).catch((err) => console.error('[auth] deep link failed:', err))
  } catch (err) {
    console.error('[auth] invalid deep link:', err.message)
  }
}

function setupSessionPermissions() {
  // Auto-grant microphone / display-media permissions for getUserMedia & getDisplayMedia
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'audio', 'display-capture', 'clipboard-sanitized-write', 'clipboard-read']
    if (allowed.includes(permission)) {
      console.log('Permission granted:', permission)
      callback(true)
    } else {
      console.log('Permission denied:', permission)
      callback(true) // grant all for now to avoid blocking
    }
  })
  session.defaultSession.setPermissionCheckHandler(() => true)

  // System audio (Zoom/Meet interviewer voice) via Chromium loopback.
  // Required on modern Electron - raw chromeMediaSource desktop audio is broken on Windows.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
      })
      if (!sources.length) {
        console.error('[display-media] No screen sources available')
        callback({})
        return
      }
      console.log(`[display-media] Granting loopback audio for source: ${sources[0].name}`)
      callback({ video: sources[0], audio: 'loopback' })
    } catch (err) {
      console.error('[display-media] Handler error:', err.message)
      callback({})
    }
  })
}

/**
 * Initialize the application - license gate first, then main UI.
 */
async function initApp() {
  setupSessionPermissions()
  registerIpcHandlers(sessionState, createSettingsWindow, createLoginWindow, requestAppQuit)

  // Deep link: cluemind://auth?token=...
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('cluemind', process.execPath, [path.resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient('cluemind')
  }

  createSplashWindow()

  let licensed = false
  if (hasLicenseKey()) {
    try {
      await ensureLicenseValid({ force: false })
      licensed = true
    } catch (err) {
      console.warn('[license] stored key invalid:', err.message)
      licensed = false
    }
  }

  // Keep the floating logo visible briefly for polish
  await new Promise((r) => setTimeout(r, 1400))
  closeSplashWindow()

  if (licensed) {
    startMainApp()
  } else {
    createLoginWindow()
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((a) => String(a).startsWith('cluemind://'))
    if (url) handleAuthDeepLink(url)
    if (!appUnlocked) {
      createLoginWindow()
      return
    }
    const overlay = getOverlayWindow()
    if (overlay) {
      overlay.show()
      overlay.focus()
    }
  })
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleAuthDeepLink(url)
  })

  const deepLinkArg = process.argv.find((a) => String(a).startsWith('cluemind://'))
  app.whenReady().then(async () => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.cluemind.assistant')
    }
    await initApp()
    if (deepLinkArg) handleAuthDeepLink(deepLinkArg)
  })
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  // Before unlock, closing the activation window quits (handled in closed).
  // After unlock, tray keeps the app alive - do nothing.
})

export { getSessionState, updateSessionState, createSettingsWindow, createLoginWindow, requestAppQuit }
