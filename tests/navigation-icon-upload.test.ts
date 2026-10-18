import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { parseUploadImageUrl, readUploadCredentials, uploadNavigationIcon, UPLOAD_ENDPOINT } from '../scripts/lib/navigation-icon-upload.ts'

const url = 'https://prod-alicdn-community.kurobbs.com/forum/test.png'
function tile() {
  const png = new PNG({ width: 128, height: 128 })
  png.data.fill(255)
  return PNG.sync.write(png)
}

describe('individual navigation icon upload', () => {
  it('reads local dotenv credentials and reports missing fields without exposing values', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'icon-upload-env-'))
    const path = join(directory, '.env')
    try {
      await expect(readUploadCredentials(path)).rejects.toThrow('无法读取')
      await writeFile(path, 'KURO_TOKEN="test-token"\nKURO_DEVCODE=test-device\n')
      expect(await readUploadCredentials(path)).toEqual({ token: 'test-token', devcode: 'test-device' })
      await writeFile(path, 'KURO_TOKEN=test-token\n')
      await expect(readUploadCredentials(path)).rejects.toThrow('请在 .env 中填写 KURO_TOKEN 和 KURO_DEVCODE')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it.each([[132, 132], [128, 132], [127, 128]])('rejects %s×%s before uploading', async (width, height) => {
    const bytes = PNG.sync.write(new PNG({ width, height }))
    let requested = false
    const request: typeof fetch = async () => { requested = true; throw new Error('Unexpected request') }
    await expect(uploadNavigationIcon(bytes, { token: 'test', devcode: 'test' }, 'unused', request)).rejects.toThrow('128×128')
    expect(requested).toBe(false)
  })
  it('uploads a PNG File once and reuses its verified URL on retry', async () => {
    const cache = await mkdtemp(join(tmpdir(), 'navigation-icon-upload-'))
    const bytes = tile()
    let uploads = 0, downloads = 0
    const request: typeof fetch = async (input, options) => {
      if (input === UPLOAD_ENDPOINT) {
        uploads++
        expect(options?.method).toBe('POST')
        expect(new Headers(options?.headers).get('content-type')).toBeNull()
        expect(new Headers(options?.headers).get('token')).toBe('test-token')
        const form = options?.body
        expect(form).toBeInstanceOf(FormData)
        if (!(form instanceof FormData)) throw new Error('Expected multipart form')
        const file = form.get('files')
        expect(file).toBeInstanceOf(File)
        if (!(file instanceof File)) throw new Error('Expected PNG file')
        expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes)
        return Response.json({ code: 200, data: [{ url }] })
      }
      downloads++
      expect(input).toBe(url)
      return new Response(new Uint8Array(bytes), { headers: { 'access-control-allow-origin': '*' } })
    }
    try {
      const credentials = { token: 'test-token', devcode: 'test-device' }
      expect(await uploadNavigationIcon(bytes, credentials, cache, request)).toBe(url)
      expect(await uploadNavigationIcon(bytes, credentials, cache, request)).toBe(url)
      expect(uploads).toBe(1)
      expect(downloads).toBe(2)
    } finally { await rm(cache, { recursive: true, force: true }) }
  })

  it('does not publish a URL whose pixels were changed by the server', async () => {
    const cache = await mkdtemp(join(tmpdir(), 'navigation-icon-upload-'))
    const different = new PNG({ width: 128, height: 128 })
    const request: typeof fetch = async input => input === UPLOAD_ENDPOINT
      ? Response.json({ code: 200, data: { url } })
      : new Response(new Uint8Array(PNG.sync.write(different)), { headers: { 'access-control-allow-origin': '*' } })
    try {
      await expect(uploadNavigationIcon(tile(), { token: 'test', devcode: 'test' }, cache, request)).rejects.toThrow('像素发生变化')
    } finally { await rm(cache, { recursive: true, force: true }) }
  })

  it('rejects ambiguous or unsuccessful upload responses', () => {
    expect(() => parseUploadImageUrl({ code: 401, data: { url } })).toThrow('上传失败')
    expect(() => parseUploadImageUrl({ code: 200, data: [url, url.replace('test', 'other')] })).toThrow('唯一')
    expect(() => parseUploadImageUrl({ code: 200, data: 'https://other.test/image.png' })).toThrow('唯一')
  })
})
