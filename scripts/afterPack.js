const path = require('path')
const { rcedit } = require('rcedit')

/** Embed ClueMind icon into the Windows exe without winCodeSign. */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const exe = path.join(context.appOutDir, 'ClueMind.exe')
  const icon = path.join(__dirname, '..', 'resources', 'icon.ico')
  console.log(`[afterPack] Embedding icon into ${exe}`)
  await rcedit(exe, { icon })
  console.log('[afterPack] Icon embedded successfully')
}
