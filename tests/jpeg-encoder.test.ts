import { describe, expect, it } from 'vitest'
import { encodeJpeg } from '../src/route/jpeg-encoder.ts'

describe('JPG export', () => {
  it('rejects failed or unsupported encoders instead of saving PNG bytes with a JPG extension', async () => {
    for (const blob of [null, new Blob(['png'], { type: 'image/png' })]) {
      await expect(encodeJpeg({ toBlob: (callback) => callback(blob) })).rejects.toThrow('JPG')
    }
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' })
    await expect(encodeJpeg({ toBlob: (callback) => callback(jpeg) })).resolves.toBe(jpeg)
  })
})
