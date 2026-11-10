import Store from 'electron-store'

const store = new Store({
  encryptionKey: 'cluemind-secure-key-v1',
  name: 'cluemind-auth'
})

/** Same store as license.js - read-only here to avoid circular imports */
const licenseStore = new Store({
  encryptionKey: 'cluemind-license-key-v1',
  name: 'cluemind-license'
})

const DEFAULT_API =
  process.env.CLUEMIND_API_URL ||
  (process.env.ELECTRON_RENDERER_URL
    ? 'http://localhost:8787'
    : 'http://yq6v2sla8zj5kmcicgzes27h.85.190.107.150.sslip.io')

function getApiBase() {
  return (store.get('apiBase') || DEFAULT_API).replace(/\/$/, '')
}

function getAuth() {
  return {
    token: store.get('authToken') || '',
    user: store.get('authUser') || null,
    apiBase: getApiBase()
  }
}

function setAuth({ token, user, apiBase }) {
  if (apiBase) store.set('apiBase', String(apiBase).replace(/\/$/, ''))
  if (token !== undefined) store.set('authToken', token || '')
  if (user !== undefined) store.set('authUser', user || null)
  return getAuth()
}

function clearAuth() {
  store.delete('authToken')
  store.delete('authUser')
  return getAuth()
}

function isLoggedIn() {
  return Boolean(getAuth().token)
}

function getLicenseKey() {
  return licenseStore.get('licenseKey') || ''
}

async function cloudFetch(path, { method = 'GET', body, token, skipAuth = false } = {}) {
  const auth = getAuth()
  const headers = { 'Content-Type': 'application/json' }

  if (!skipAuth) {
    const bearer = token || auth.token
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`
    } else {
      const licenseKey = getLicenseKey()
      if (licenseKey) {
        headers['X-License-Key'] = licenseKey
      }
    }
  }

  const res = await fetch(`${auth.apiBase}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Cloud API error ${res.status}`)
    err.status = res.status
    err.code = data.code
    throw err
  }
  return data
}

async function loginWithPassword(email, password) {
  const data = await cloudFetch('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true
  })
  return setAuth({ token: data.token, user: data.user })
}

async function registerWithPassword({ name, email, password }) {
  const data = await cloudFetch('/api/auth/register', {
    method: 'POST',
    body: { name, email, password },
    skipAuth: true
  })
  return setAuth({ token: data.token, user: data.user })
}

async function loginWithToken(token) {
  setAuth({ token, user: null })
  const me = await cloudFetch('/api/auth/me')
  return setAuth({ token, user: me.user })
}

async function fetchMe() {
  const me = await cloudFetch('/api/auth/me')
  setAuth({ user: me.user })
  return me
}

async function createSttSession(language = 'en') {
  return cloudFetch('/api/stt/session', { method: 'POST', body: { language } })
}

async function reportSttUsage(seconds) {
  return cloudFetch('/api/stt/usage', { method: 'POST', body: { seconds } })
}

async function cloudSuggest({ transcript, mode, priorAnswers }) {
  return cloudFetch('/api/ai/suggest', {
    method: 'POST',
    body: { transcript, mode, priorAnswers }
  })
}

async function cloudRecap({ transcript, suggestions, mode, durationMs }) {
  return cloudFetch('/api/ai/recap', {
    method: 'POST',
    body: { transcript, suggestions, mode, durationMs }
  })
}

async function cloudMockStart() {
  return cloudFetch('/api/ai/mock/start', { method: 'POST', body: {} })
}

async function fetchProfile() {
  return cloudFetch('/api/account/profile')
}

async function saveProfile(body) {
  return cloudFetch('/api/account/profile', { method: 'PUT', body })
}

async function fetchPlaybooks() {
  return cloudFetch('/api/account/playbooks')
}

async function createPlaybook(body) {
  return cloudFetch('/api/account/playbooks', { method: 'POST', body })
}

async function cloudAnalyzeScreen({ imageBase64, memory }) {
  return cloudFetch('/api/ai/screen', {
    method: 'POST',
    body: { imageBase64, memory }
  })
}

async function cloudAskAboutScreen({ imageBase64, question, memory }) {
  return cloudFetch('/api/ai/chat', {
    method: 'POST',
    body: { imageBase64, question, memory }
  })
}

/** Licensed users always use admin-configured cloud AI/STT */
function useCloudAI() {
  return Boolean(getLicenseKey()) || isLoggedIn()
}

/** True when cloud failed because the SaaS server has no provider keys */
function isCloudUnavailableError(err) {
  if (!err) return false
  if (err.status === 503) return true
  const msg = String(err.message || '')
  return /not configured/i.test(msg) || /AI is not configured/i.test(msg)
}

export {
  getApiBase,
  getAuth,
  setAuth,
  clearAuth,
  isLoggedIn,
  cloudFetch,
  loginWithPassword,
  registerWithPassword,
  loginWithToken,
  fetchMe,
  createSttSession,
  reportSttUsage,
  cloudSuggest,
  cloudAnalyzeScreen,
  cloudAskAboutScreen,
  cloudRecap,
  cloudMockStart,
  fetchProfile,
  saveProfile,
  fetchPlaybooks,
  createPlaybook,
  useCloudAI,
  isCloudUnavailableError
}
