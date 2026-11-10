import { app, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Resolve ClueMind window/taskbar icon (packaged + dev).
 * @returns {Electron.NativeImage|string|undefined}
 */
function resolveAppIcon() {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(process.resourcesPath || '', 'logo.png'),
    path.join(app.getAppPath(), 'resources', 'icon.ico'),
    path.join(app.getAppPath(), 'resources', 'icon.png'),
    path.join(__dirname, '../../resources/icon.ico'),
    path.join(__dirname, '../../resources/icon.png'),
    path.join(__dirname, '../renderer/assets/logo.png')
  ]

  for (const p of candidates) {
    try {
      if (!p || !fs.existsSync(p)) continue
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    } catch (_) { /* try next */ }
  }
  return undefined
}

function resolveAppIconPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(process.resourcesPath || '', 'logo.png'),
    path.join(app.getAppPath(), 'resources', 'icon.ico'),
    path.join(app.getAppPath(), 'resources', 'icon.png'),
    path.join(__dirname, '../../resources/icon.ico'),
    path.join(__dirname, '../../resources/icon.png')
  ]
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p
    } catch (_) { /* try next */ }
  }
  return undefined
}

export { resolveAppIcon, resolveAppIconPath }
