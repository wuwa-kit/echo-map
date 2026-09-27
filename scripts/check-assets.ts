import { tilePreviewUrl } from '../src/data/official-asset-urls.ts'
import { buildOfficialAssets } from '../src/domain/official-assets.ts'
import { isMainModule } from './lib/files.ts'
import { readMapDataset } from './lib/map-data.ts'

export async function checkAssetUrls(urls: readonly string[]): Promise<{ url: string; error: string }[]> {
  const failures: { url: string; error: string }[] = []
  const queue = new Set(urls).values()
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (const url of queue) {
      try {
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) })
        if (!response.ok) failures.push({ url, error: `HTTP ${response.status}` })
      } catch (error) {
        failures.push({ url, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }))
  return failures.sort((left, right) => left.url.localeCompare(right.url))
}

if (isMainModule(import.meta.url)) {
  const dataset = await readMapDataset()
  const assets = buildOfficialAssets(dataset)
  const urls = [...new Set(assets.flatMap((asset) => [
    asset.url,
    asset.previewUrl,
    ...(['tile', 'floor', 'gravity'].includes(asset.category)
      ? [tilePreviewUrl(asset.url, dataset.source.tileWidth)] : []),
  ]))]
  console.log(`检查官方资源 ${dataset.source.mapResourceHash}：${urls.length} 个原图、预览与地图加载 URL…`)
  const failures = await checkAssetUrls(urls)
  for (const { url, error } of failures) console.error(`${error}: ${url}`)
  console.log(`检查完成：${urls.length - failures.length} 个成功，${failures.length} 个失败`)
  if (failures.length > 0) {
    console.error('地图瓦片 404 时请运行 pnpm data:sync:map 和 pnpm data:convert-official，再运行 pnpm data:validate 与 pnpm data:check-assets。')
    process.exitCode = 1
  }
}
