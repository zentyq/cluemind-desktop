import { Tray, Menu, nativeImage, app } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { resolveAppIcon } from './app-icon.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {Tray|null} */
let tray = null

function resolveTrayIcon() {
  const full = resolveAppIcon()
  if (full && !full.isEmpty()) return full.resize({ width: 16, height: 16 })

  const candidates = [
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(process.resourcesPath || '', 'logo.png'),
    path.join(__dirname, '../../resources/icon.png'),
    path.join(__dirname, '../renderer/assets/logo.png')
  ]
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) return img.resize({ width: 16, height: 16 })
      }
    } catch (_) { /* try next */ }
  }
  return nativeImage.createEmpty()
}

/**
 * Create the system tray icon and menu
 */
function createTray(onToggleOverlay, onToggleSession, onOpenSettings, onQuit) {
  const icon = resolveTrayIcon()
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide Overlay (Ctrl+Shift+A)',
      click: onToggleOverlay
    },
    {
      label: 'Start/Stop Session (Ctrl+Shift+S)',
      click: onToggleSession
    },
    { type: 'separator' },
    {
      label: 'Settings (Ctrl+Shift+,)',
      click: onOpenSettings
    },
    {
      label: 'Check for updates',
      click: () => {
        import('./updater.js').then(({ checkForUpdates }) => checkForUpdates(true))
      }
    },
    { type: 'separator' },
    {
      label: 'Quit ClueMind',
      click: onQuit
    }
  ])

  tray.setToolTip('ClueMind')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    onToggleOverlay()
  })

  return tray
}

export { createTray }
