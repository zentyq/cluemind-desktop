const licenseError = document.getElementById('licenseError')
const activateBtn = document.getElementById('activateBtn')
const licenseKeyInput = document.getElementById('licenseKey')
const isChangeFlow = new URLSearchParams(location.search).get('change') === '1'

document.getElementById('quitBtn')?.addEventListener('click', (e) => {
  e.preventDefault()
  e.stopPropagation()
  window.cluemind.quitApp()
})

document.getElementById('minimizeBtn')?.addEventListener('click', (e) => {
  e.preventDefault()
  e.stopPropagation()
  window.cluemind.minimizeLogin()
})

async function openDashboard() {
  const settings = await window.cluemind.getSettings()
  const base = (settings.webAppUrl || settings.apiBase || 'http://yq6v2sla8zj5kmcicgzes27h.85.190.107.150.sslip.io')
    .replace(':8787', ':5173')
    .replace(/\/$/, '')
  const web =
    /localhost|127\.0\.0\.1/.test(base) && !settings.apiBase?.includes('railway')
      ? 'http://yq6v2sla8zj5kmcicgzes27h.85.190.107.150.sslip.io'
      : base.includes('8787')
        ? base.replace('8787', '5173')
        : base
  window.cluemind.openExternal(`${web.replace(/\/$/, '')}/signup.html`)
}

document.getElementById('openDashboard')?.addEventListener('click', openDashboard)

activateBtn.addEventListener('click', async () => {
  licenseError.style.color = '#fb7185'
  licenseError.textContent = ''
  activateBtn.disabled = true
  try {
    const key = licenseKeyInput.value.trim()
    const result = await window.cluemind.activateLicense(key)
    if (!result.success) throw new Error(result.error || 'Activation failed')
    licenseError.style.color = '#34d399'
    licenseError.textContent = isChangeFlow
      ? 'License updated. You can keep using ClueMind.'
      : 'License activated. Starting ClueMind…'
    await window.cluemind.closeLogin()
  } catch (err) {
    licenseError.style.color = '#fb7185'
    licenseError.textContent = err.message || String(err)
  } finally {
    activateBtn.disabled = false
  }
})

licenseKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') activateBtn.click()
})

;(async () => {
  if (isChangeFlow) {
    const title = document.querySelector('h1')
    const muted = document.querySelector('.body > .muted')
    if (title) title.textContent = 'Enter a new license key'
    if (muted) {
      muted.textContent =
        'Your previous key was cleared. Paste a new key from your dashboard to continue.'
    }
    activateBtn.textContent = 'Activate new key →'
    licenseKeyInput.value = ''
    licenseKeyInput.placeholder = 'CM-XXXX-XXXX-XXXX-XXXX'
    licenseKeyInput.focus()
    return
  }

  try {
    const lic = await window.cluemind.getLicenseStatus()
    if (lic?.activated) {
      licenseKeyInput.placeholder = 'License already active'
      licenseError.style.color = '#34d399'
      licenseError.textContent = `Licensed (${lic.plan || 'active'}). Starting…`
      activateBtn.textContent = 'Continue →'
      setTimeout(() => window.cluemind.closeLogin(), 400)
    }
  } catch (_) { /* ignore */ }
})()
