import { autoUpdater } from 'electron-updater'
import { dialog, app } from 'electron'

const FEED_URL =
  process.env.CLUEMIND_UPDATE_URL ||
  'https://yq6v2sla8zj5kmcicgzes27h.85.190.107.150.sslip.io/api/updates'

let started = false
let checking = false
let lastCheckExplicit = false

function notify(title, message) {
  return dialog.showMessageBox({
    type: 'info',
    title,
    message,
    buttons: ['OK']
  })
}

export function startAutoUpdater({ onQuitForUpdate } = {}) {
  if (started) return
  if (!app.isPackaged) {
    console.log('[updater] Skipped in development')
    return
  }
  started = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.setFeedURL({ provider: 'generic', url: FEED_URL })

  autoUpdater.on('error', (err) => {
    console.warn('[updater]', err.message)
  })

  autoUpdater.on('update-available', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'ClueMind update',
      message: `Version ${info.version} is available.`,
      detail: 'You can update now without downloading from the website.',
      buttons: ['Update now', 'Later'],
      defaultId: 0,
      cancelId: 1
    })
    if (response === 0) {
      try {
        await autoUpdater.downloadUpdate()
      } catch (err) {
        notify('Update failed', err.message || 'Could not download the update.')
      }
    }
  })

  autoUpdater.on('update-not-available', () => {
    if (lastCheckExplicit) {
      notify('You are up to date', `ClueMind ${app.getVersion()} is the latest version.`)
    }
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: `ClueMind ${info.version} is ready to install.`,
      detail: 'The app will restart to finish the update. Your license key stays on this PC.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1
    })
    if (response === 0) {
      if (typeof onQuitForUpdate === 'function') onQuitForUpdate()
      autoUpdater.quitAndInstall(false, true)
    }
  })

  setTimeout(() => checkForUpdates(false), 8000)
  setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000)
}

export async function checkForUpdates(explicit = true) {
  if (!app.isPackaged) {
    if (explicit) {
      await notify('Updates', 'Update checks run in the installed app, not in development mode.')
    }
    return { ok: false, reason: 'dev' }
  }
  if (checking) return { ok: true, reason: 'busy' }
  lastCheckExplicit = explicit
  checking = true
  try {
    const result = await autoUpdater.checkForUpdates()
    return { ok: true, version: result?.updateInfo?.version }
  } catch (err) {
    console.warn('[updater] check failed:', err.message)
    if (explicit) await notify('Update check failed', err.message || 'Could not reach the update server.')
    return { ok: false, error: err.message }
  } finally {
    checking = false
  }
}
