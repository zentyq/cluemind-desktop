import Store from 'electron-store'
import os from 'os'
import { getApiBase, cloudFetch } from './client.js'

const licenseStore = new Store({
  encryptionKey: 'cluemind-license-key-v1',
  name: 'cluemind-license'
})

function getStoredLicense() {
  return {
    key: licenseStore.get('licenseKey') || '',
    meta: licenseStore.get('licenseMeta') || null,
    validatedAt: licenseStore.get('validatedAt') || 0
  }
}

function clearLicense() {
  licenseStore.delete('licenseKey')
  licenseStore.delete('licenseMeta')
  licenseStore.delete('validatedAt')
}

function hasLicenseKey() {
  return Boolean(getStoredLicense().key)
}

async function activateLicense(rawKey) {
  const key = String(rawKey || '').trim().toUpperCase()
  if (!key) {
    const err = new Error('Enter a license key')
    err.status = 400
    throw err
  }

  const data = await cloudFetch('/api/licenses/validate', {
    method: 'POST',
    body: {
      key,
      deviceName: `${os.hostname()} · ${os.platform()}`
    },
    skipAuth: true
  })

  if (!data.valid) {
    const err = new Error(data.error || 'Invalid license key')
    err.status = 403
    throw err
  }

  licenseStore.set('licenseKey', key)
  licenseStore.set('licenseMeta', {
    plan: data.plan,
    stealth: data.stealth,
    user: data.user,
    license: data.license
  })
  licenseStore.set('validatedAt', Date.now())
  return data
}

/**
 * Re-validate stored license with the server.
 * Uses a short cache so the app stays usable offline briefly after a successful check.
 */
async function ensureLicenseValid({ force = false } = {}) {
  const stored = getStoredLicense()
  if (!stored.key) {
    const err = new Error('Activate ClueMind with a license key from your dashboard.')
    err.status = 401
    err.code = 'LICENSE_REQUIRED'
    throw err
  }

  const age = Date.now() - (stored.validatedAt || 0)
  if (!force && age < 6 * 60 * 60 * 1000 && stored.meta) {
    return { valid: true, cached: true, ...stored.meta, key: stored.key }
  }

  try {
    const data = await activateLicense(stored.key)
    return { ...data, cached: false }
  } catch (err) {
    const status = err.status || 0
    const hardFail =
      status === 401 ||
      status === 403 ||
      status === 404 ||
      /revoked|not found|invalid license|license key not found/i.test(String(err.message || ''))

    if (hardFail) {
      clearLicense()
      throw err
    }

    // Keep last-known-good only for brief network / server outages
    if (!force && stored.meta && age < 48 * 60 * 60 * 1000) {
      console.warn('[license] revalidation failed, using cached license:', err.message)
      return { valid: true, cached: true, stale: true, ...stored.meta, key: stored.key }
    }
    throw err
  }
}

function getLicenseApiBase() {
  return getApiBase()
}

export {
  getStoredLicense,
  clearLicense,
  hasLicenseKey,
  activateLicense,
  ensureLicenseValid,
  getLicenseApiBase
}
