const JPEG_QUALITY = 0.85

export function encodeJpeg(canvas: Pick<HTMLCanvasElement, 'toBlob'>): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/jpeg') reject(new Error('JPG 图片编码失败'))
      else resolve(blob)
    }, 'image/jpeg', JPEG_QUALITY)
  })
}
