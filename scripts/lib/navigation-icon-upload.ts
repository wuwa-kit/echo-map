import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { PNG } from 'pngjs'
import { z } from 'zod'
import { projectPath, writeJson } from './files.ts'

export async function readUploadCredentials(path = projectPath('.env')): Promise<{ token: string; devcode: string }> {
  let env: ReturnType<typeof parseEnv>
  try { env = parseEnv(await readFile(path, 'utf8')) }
  catch { throw new Error('无法读取项目 .env 上传凭证文件') }
  const token = env.KURO_TOKEN?.trim()
  const devcode = env.KURO_DEVCODE?.trim()
  if (!token || !devcode) throw new Error('请在 .env 中填写 KURO_TOKEN 和 KURO_DEVCODE')
  return { token, devcode }
}

export const kuroImageUrlSchema = z.url().refine(value => {
  const url = new URL(value)
  return url.protocol === 'https:' && url.hostname === 'prod-alicdn-community.kurobbs.com' && !url.port && !url.username && !url.password && url.pathname.startsWith('/forum/') && !url.hash
}, '需要库街区图片 CDN 地址')
export const UPLOAD_ENDPOINT = 'https://api.kurobbs.com/forum/uploadForumImgForH5'
export function parseUploadImageUrl(body: unknown): string {
  const response = z.object({ code: z.union([z.number(), z.string()]), data: z.unknown() }).parse(body)
  if (!['0', '200'].includes(String(response.code))) throw new Error(`库街区上传失败（code ${String(response.code).slice(0, 20)}），请检查登录凭证`)
  const urls = new Set<string>()
  function visit(value: unknown, depth: number): void {
    if (depth > 8) return
    if (typeof value === 'string') {
      const parsed = kuroImageUrlSchema.safeParse(value)
      if (parsed.success) urls.add(parsed.data)
    } else if (Array.isArray(value)) value.forEach(item => visit(item, depth + 1))
    else if (value && typeof value === 'object') Object.values(value).forEach(item => visit(item, depth + 1))
  }
  visit(response.data, 0)
  if (urls.size !== 1) throw new Error('上传响应未包含唯一的库街区图片地址')
  return [...urls][0] ?? ''
}
export async function verifyUploadedIcon(url: string, expected: Buffer, request: typeof fetch = fetch): Promise<void> {
  kuroImageUrlSchema.parse(url)
  const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(60_000), headers: { Origin: 'https://www.kurobbs.com' } })
  if (!response.ok) throw new Error(`上传图片无法读取（HTTP ${response.status}）`)
  if (response.headers.get('access-control-allow-origin') !== '*') throw new Error('上传图片不允许匿名跨域读取，无法用于地图导出')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > 16 * 1024 * 1024) throw new Error('上传图片响应过大')
  const actual = PNG.sync.read(bytes), original = PNG.sync.read(expected)
  if (actual.width !== original.width || actual.height !== original.height || !actual.data.equals(original.data)) throw new Error('上传图片尺寸或像素发生变化')
}
export async function uploadNavigationIcon(bytes: Buffer, credentials: { token: string; devcode: string }, cache: string, request: typeof fetch = fetch): Promise<string> {
  const image = PNG.sync.read(bytes)
  if (image.width !== 128 || image.height !== 128) throw new Error('定位图标需要 128×128 像素 PNG')
  const hash = createHash('sha256').update(bytes).digest('hex')
  await mkdir(cache, { recursive: true })
  const path = join(cache, `${hash}.json`)
  let url: string | undefined
  try { url = kuroImageUrlSchema.parse(JSON.parse(await readFile(path, 'utf8')).url) } catch { /* 尚未上传。 */ }
  if (!url) {
    const form = new FormData()
    form.append('files', new File([new Uint8Array(bytes)], `navigation-${hash}.png`, { type: 'image/png' }))
    let response: Response
    try {
      response = await request(UPLOAD_ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000), headers: { accept: 'application/json, text/plain, */*', source: 'h5', state_id: '8', wiki_type: '10', token: credentials.token, devcode: credentials.devcode, Referer: 'https://www.kurobbs.com/', Origin: 'https://www.kurobbs.com' }, body: form })
    } catch { throw new Error('上传连接失败或超时，可重试') }
    if (!response.ok) throw new Error(`库街区上传失败（HTTP ${response.status}）`)
    url = parseUploadImageUrl(await response.json())
    await writeJson(path, { url })
  }
  await verifyUploadedIcon(url, bytes, request)
  return url
}
