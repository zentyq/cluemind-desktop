import { desktopCapturer, nativeImage } from 'electron'

/**
 * Capture the primary screen and return as base64 JPEG
 * @returns {Promise<string>} Base64-encoded JPEG image data (without data URI prefix)
 */
async function captureScreen() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  })

  if (!sources || sources.length === 0) {
    throw new Error('No screen sources available')
  }

  // Use the primary screen (first source)
  const primarySource = sources[0]

  // Get the thumbnail as a NativeImage and convert to JPEG base64
  const thumbnail = primarySource.thumbnail
  const jpegBuffer = thumbnail.toJPEG(85)
  const base64 = jpegBuffer.toString('base64')

  return base64
}

/**
 * Convert a bitmap buffer to base64 JPEG string
 * @param {Buffer} bitmap - Raw bitmap data
 * @param {number} quality - JPEG quality 0-1
 * @returns {string} Base64-encoded JPEG
 */
function bitmapToBase64(bitmap, quality = 0.85) {
  const image = nativeImage.createFromBuffer(bitmap)
  const jpegBuffer = image.toJPEG(Math.round(quality * 100))
  return jpegBuffer.toString('base64')
}

export { captureScreen, bitmapToBase64 }
