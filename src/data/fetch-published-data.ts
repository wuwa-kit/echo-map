import { readPublishedDataPng } from './published-data-png.ts'
import type { PublicDataFilename } from './published-data-png.ts'
import { readPublishedDataCache, writePublishedDataCache } from './published-data-cache.ts'

let pendingArchive: ReturnType<typeof readPublishedDataPng> | undefined

const dataLabels: Record<PublicDataFilename, string> = {
  'map-data.json': '地图数据',
  'catalog-data.json': '图鉴与图标数据',
  'official-echo-points.json': '官方声骸点位',
  'custom-echo-points.json': '人工声骸点位',
  'custom-navigation-points.json': '人工定位点',
  'map-asset-catalog.json': '地图资产目录',
}

async function fetchPublishedArchive() {
  const url = import.meta.env.VITE_PUBLISHED_DATA_URL
  if (!url) throw new Error('缺少发布数据 CDN 链接')
  const cached = await readPublishedDataCache(url).catch(() => undefined)
  if (cached) return cached

  const response = await fetch(url)
  if (!response.ok) throw new Error(`发布数据加载失败：${response.status}`)
  const archive = await readPublishedDataPng(await response.arrayBuffer())
  await writePublishedDataCache(url, archive).catch(() => undefined)
  return archive
}

export function loadPublishedArchive() {
  pendingArchive ??= fetchPublishedArchive().catch((error: unknown) => {
    pendingArchive = undefined
    throw error
  })
  return pendingArchive
}

export async function fetchPublishedData(filename: PublicDataFilename, onMissing?: () => unknown): Promise<unknown> {
  if (import.meta.env.DEV) {
    const response = await fetch(`/data/${filename}`, { cache: 'no-store' })
    if (response.status === 404 && onMissing) return onMissing()
    if (!response.ok) throw new Error(`${dataLabels[filename]}加载失败：${response.status}`)
    return response.json()
  }

  return (await loadPublishedArchive())[filename]
}
