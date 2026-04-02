import { Tray, Menu, nativeImage } from 'electron'
import zlib from 'zlib'

/** @type {Tray|null} */
let tray = null

/**
 * Create the system tray icon and menu
 * @param {Function} onToggleOverlay - Callback for show/hide overlay
 * @param {Function} onToggleSession - Callback for start/stop session
 * @param {Function} onOpenSettings - Callback for opening settings
 * @param {Function} onQuit - Callback for quitting the app
 */
function createTray(onToggleOverlay, onToggleSession, onOpenSettings, onQuit) {
  // Create a simple 16x16 tray icon programmatically
  const icon = nativeImage.createFromBuffer(createTrayIconBuffer())
  tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide Overlay',
      click: onToggleOverlay
    },
    {
      label: 'Start/Stop Session',
      click: onToggleSession
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: onOpenSettings
    },
    { type: 'separator' },
    {
      label: 'Quit ClueMind',
      click: onQuit
    }
  ])

  tray.setToolTip('ClueMind AI Assistant')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    onToggleOverlay()
  })

  return tray
}

/**
 * Create a simple tray icon buffer (purple circle)
 * @returns {Buffer} PNG buffer for the tray icon
 */
function createTrayIconBuffer() {
  // Simple 16x16 PNG with purple circle - minimal valid PNG
  // Using a data URI approach for a simple colored icon
  const size = 16
  const canvas = []

  // PNG header
  const header = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x10, // width: 16
    0x00, 0x00, 0x00, 0x10, // height: 16
    0x08, 0x06, // 8-bit RGBA
    0x00, 0x00, 0x00,
    0x1F, 0xF3, 0xFF, 0x61 // IHDR CRC
  ])

  // Create raw RGBA pixel data for a purple circle
  const rawData = Buffer.alloc(size * (1 + size * 4)) // filter byte + RGBA per pixel per row
  const cx = 7.5, cy = 7.5, r = 7
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4)
    rawData[rowStart] = 0 // filter: None
    for (let x = 0; x < size; x++) {
      const offset = rowStart + 1 + x * 4
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (dist <= r) {
        rawData[offset] = 0x7C     // R
        rawData[offset + 1] = 0x3A // G
        rawData[offset + 2] = 0xED // B
        rawData[offset + 3] = 0xFF // A
      } else {
        rawData[offset] = 0x00
        rawData[offset + 1] = 0x00
        rawData[offset + 2] = 0x00
        rawData[offset + 3] = 0x00
      }
    }
  }

  const compressed = zlib.deflateSync(rawData)

  // Build IDAT chunk
  const idatLength = Buffer.alloc(4)
  idatLength.writeUInt32BE(compressed.length, 0)
  const idatType = Buffer.from('IDAT')
  const idatCrc = crc32(Buffer.concat([idatType, compressed]))
  const idatCrcBuf = Buffer.alloc(4)
  idatCrcBuf.writeUInt32BE(idatCrc, 0)

  // IEND chunk
  const iend = Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ])

  return Buffer.concat([header, idatLength, idatType, compressed, idatCrcBuf, iend])
}

/**
 * Simple CRC32 implementation for PNG chunks
 * @param {Buffer} buf - Data to compute CRC for
 * @returns {number} CRC32 value
 */
function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

export { createTray }
