/**
 * ClueMind Settings - preferences + cloud profile
 */

const defaultModeSelect = document.getElementById('defaultMode')
const interviewLanguageSelect = document.getElementById('interviewLanguage')
const spokenLanguageSelect = document.getElementById('spokenLanguage')
const rolePackSelect = document.getElementById('rolePack')
const audioSourceSelect = document.getElementById('audioSource')
const autoSuggestSelect = document.getElementById('autoSuggest')
const resumeText = document.getElementById('resumeText')
const jobDescription = document.getElementById('jobDescription')
const saveBtn = document.getElementById('saveBtn')
const cancelBtn = document.getElementById('cancelBtn')
const closeBtn = document.getElementById('closeBtn')
const licenseBadge = document.getElementById('licenseBadge')
const licenseHint = document.getElementById('licenseHint')
const playbookList = document.getElementById('playbookList')

async function loadSettings() {
  try {
    const settings = await window.cluemind.getSettings()
    defaultModeSelect.value = settings.defaultMode || 'meeting'
    interviewLanguageSelect.value = settings.interviewLanguage || 'javascript'
    if (spokenLanguageSelect) spokenLanguageSelect.value = settings.spokenLanguage || 'en'
    if (rolePackSelect) rolePackSelect.value = settings.rolePack || 'swe'
    if (audioSourceSelect) audioSourceSelect.value = settings.audioSource || 'auto'
    if (autoSuggestSelect) autoSuggestSelect.value = String(Boolean(settings.autoSuggest))
    await refreshLicense()
    await loadProfile()
    await loadPlaybooks()
  } catch (err) {
    console.error('Failed to load settings:', err)
  }
}

async function loadProfile() {
  try {
    const data = await window.cluemind.getProfile()
    if (!data?.success && data?.error) return
    if (resumeText) resumeText.value = data.resumeText || ''
    if (jobDescription) jobDescription.value = data.jobDescription || ''
    if (rolePackSelect && data.rolePack) rolePackSelect.value = data.rolePack
    if (spokenLanguageSelect && data.language) spokenLanguageSelect.value = data.language
  } catch (_) { /* ignore */ }
}

async function loadPlaybooks() {
  if (!playbookList) return
  try {
    const data = await window.cluemind.getPlaybooks()
    const items = data.playbooks || []
    playbookList.textContent = items.length
      ? items.map((p) => p.title).join(' · ')
      : 'No stories yet. Add one below.'
  } catch {
    playbookList.textContent = 'Sign in / activate to sync playbooks.'
  }
}

async function refreshLicense() {
  try {
    const lic = await window.cluemind.getLicenseStatus()
    if (lic?.activated) {
      licenseBadge.textContent = `Licensed · ${(lic.plan || 'active').toUpperCase()}`
      licenseBadge.className = 'badge badge-on'
      licenseHint.textContent =
        'AI and speech run through the ClueMind server using keys set by your admin.'
    } else {
      licenseBadge.textContent = 'License required'
      licenseBadge.className = 'badge badge-off'
      licenseHint.textContent =
        'Activate with a license key from your website dashboard before using ClueMind.'
    }
  } catch (_) {
    licenseBadge.textContent = 'License status unknown'
    licenseBadge.className = 'badge badge-off'
  }
}

document.getElementById('changeLicenseBtn')?.addEventListener('click', async () => {
  try {
    await window.cluemind.clearLicense()
  } catch (_) { /* ignore */ }
  window.cluemind.openLogin({ change: true })
  window.cluemind.closeWindow()
})

document.getElementById('checkUpdatesBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('checkUpdatesBtn')
  btn.textContent = 'Checking…'
  try {
    await window.cluemind.checkForUpdates()
  } finally {
    btn.textContent = 'Check for updates'
  }
})

document.getElementById('openDashboardBtn')?.addEventListener('click', async () => {
  const settings = await window.cluemind.getSettings()
  const url = settings.webAppUrl || 'http://localhost:5173/dashboard.html'
  window.cluemind.openExternal(
    url.includes('dashboard') ? url : `${url.replace(/\/$/, '')}/dashboard.html`
  )
})

document.getElementById('addPlaybookBtn')?.addEventListener('click', async () => {
  const title = document.getElementById('playbookTitle')?.value || ''
  const body = document.getElementById('playbookBody')?.value || ''
  const result = await window.cluemind.addPlaybook({ title, body })
  if (result.success) {
    document.getElementById('playbookTitle').value = ''
    document.getElementById('playbookBody').value = ''
    await loadPlaybooks()
  } else {
    alert(result.error || 'Could not save story')
  }
})

saveBtn.addEventListener('click', async () => {
  try {
    await window.cluemind.saveSettings({
      defaultMode: defaultModeSelect.value,
      interviewLanguage: interviewLanguageSelect.value,
      spokenLanguage: spokenLanguageSelect?.value,
      rolePack: rolePackSelect?.value,
      audioSource: audioSourceSelect?.value,
      autoSuggest: autoSuggestSelect?.value === 'true'
    })
    await window.cluemind.saveProfile({
      resumeText: resumeText?.value || '',
      jobDescription: jobDescription?.value || '',
      rolePack: rolePackSelect?.value,
      language: spokenLanguageSelect?.value
    })
    saveBtn.textContent = 'Saved!'
    saveBtn.classList.add('saved')
    setTimeout(() => {
      saveBtn.textContent = 'Save preferences'
      saveBtn.classList.remove('saved')
    }, 1600)
  } catch (err) {
    console.error('Failed to save settings:', err)
    saveBtn.textContent = 'Error'
    setTimeout(() => {
      saveBtn.textContent = 'Save preferences'
    }, 1600)
  }
})

cancelBtn.addEventListener('click', () => window.cluemind.closeWindow())
closeBtn.addEventListener('click', () => window.cluemind.closeWindow())

loadSettings()
