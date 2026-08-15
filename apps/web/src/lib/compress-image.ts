// Client-side compression before upload (design-plan.md Milestone 7): resize
// to ~1200px wide, JPEG q≈0.75 — matching data-pipeline/compress_images.py's
// target so seeded and crowdsourced photos end up comparable in size.

const MAX_WIDTH = 1200
const JPEG_QUALITY = 0.75

export function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const scale = Math.min(1, MAX_WIDTH / img.width)
      const width = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('This browser cannot process images (canvas unsupported).'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read that image file.'))
    }

    img.src = objectUrl
  })
}
