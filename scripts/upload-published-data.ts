import { isMainModule, projectPath, writeJson } from './lib/files.ts'
import { readUploadCredentials, uploadPngImage } from './lib/navigation-icon-upload.ts'
import { createPublishedDataPng } from './lib/published-data-png.ts'

async function verifyPublishedData(url: string, expected: Buffer, request: typeof fetch): Promise<void> {
  const response = await request(url, {
    headers: { Origin: 'https://wa.songe.li' },
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`CDN 数据包下载失败（HTTP ${response.status}）`)
  if (response.headers.get('access-control-allow-origin') !== '*') {
    throw new Error('CDN 数据包不允许匿名跨域读取')
  }
  if (!Buffer.from(await response.arrayBuffer()).equals(expected)) {
    throw new Error('CDN 数据包与上传原件不一致')
  }
}

export async function uploadPublishedData(credentials: Awaited<ReturnType<typeof readUploadCredentials>>, request: typeof fetch = fetch) {
  const png = await createPublishedDataPng()
  const url = await uploadPngImage(png, credentials, projectPath('.local', 'published-data-upload'), request, verifyPublishedData)
  await writeJson(projectPath('data', 'config', 'published-data-url.json'), { url }, { skipUnchanged: true })
  return { url, size: png.length }
}

if (isMainModule(import.meta.url)) {
  const { url, size } = await uploadPublishedData(await readUploadCredentials())
  console.log(`已发布数据包（${size} 字节） ${url}`)
}
