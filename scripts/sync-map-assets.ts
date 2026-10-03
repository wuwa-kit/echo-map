import { fetchMapConfiguration } from './lib/map/source.ts'
import { deduplicateMapAssets, normalizeMapAssets } from './lib/map/asset-catalog.ts'
import { STATIC_ROOT } from './lib/map/normalize.ts'
import { fetchJson } from './lib/http.ts'
import { isMainModule, projectPath, readJson, writeJson } from './lib/files.ts'
import type { NavigationConfig } from './lib/map/types.ts'

export async function syncMapAssets(): Promise<void> {
  const configuration = await fetchMapConfiguration()
  const navigationConfig = await readJson<NavigationConfig>(projectPath('data', 'config', 'map-navigation-types.json'))
  const payloads = await Promise.all(configuration.states.map(async (state) => ({
    state,
    catalogData: await fetchJson<unknown>(`${STATIC_ROOT}/mcmap/catalog/${configuration.resourceHash}/${state.id}/catalog.json`),
  })))
  const catalog = await deduplicateMapAssets(normalizeMapAssets(payloads, configuration.resourceHash, new Date().toISOString(), navigationConfig))
  await writeJson(projectPath('public', 'data', 'map-asset-catalog.json'), catalog, { compact: true })
  for (const category of ['navigation', 'exploration', 'challenge', 'service']) console.log(`${category}: ${catalog.assets.filter((asset) => asset.categories.some((value) => value === category)).length}`)
  console.log(`官方地图目录同步完成：${catalog.assets.length} 个图标与名称条目`)
}

if (isMainModule(import.meta.url)) await syncMapAssets()
