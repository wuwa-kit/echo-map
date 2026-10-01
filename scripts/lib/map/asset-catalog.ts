import type { OfficialAsset, OfficialAssetCategory, OfficialMapAssetCatalog } from '../../../src/domain/types.ts'
import { officialMapAssetCatalogSchema } from '../../../src/domain/schema.ts'
import { asArray, asRecord, asString } from '../raw.ts'
import { iconUrl, STATIC_ROOT } from './normalize.ts'
import { createHash } from 'node:crypto'
import { fetchBytes } from '../http.ts'
import { PNG } from 'pngjs'

export async function deduplicateMapAssets(catalog: OfficialMapAssetCatalog): Promise<OfficialMapAssetCatalog> {
  const hashes = new Map<string, string>()
  const urls = [...new Set(catalog.assets.map(({ url }) => url))]
  await Promise.all(urls.map(async (url) => {
    const image = PNG.sync.read(Buffer.from(await fetchBytes(url)))
    // Invisible RGB values and PNG metadata do not change the displayed icon.
    for (let offset = 0; offset < image.data.length; offset += 4) {
      if (image.data[offset + 3] === 0) image.data.fill(0, offset, offset + 3)
    }
    hashes.set(url, createHash('sha256').update(`${image.width}x${image.height}:`).update(image.data).digest('hex'))
  }))
  const merged = new Map<string, OfficialAsset>()
  for (const asset of catalog.assets) {
    const key = hashes.get(asset.url)
    if (!key) throw new Error(`图标缺少内容指纹：${asset.url}`)
    const previous = merged.get(key)
    if (!previous) {
      merged.set(key, { ...asset })
      continue
    }
    previous.stateIds = [...new Set([...previous.stateIds, ...asset.stateIds])].sort((a, b) => a - b)
    previous.referenceIds = [...new Set([...previous.referenceIds, ...asset.referenceIds])]
    previous.categories = [...new Set([...previous.categories, ...asset.categories])]
    previous.tags = [...new Set([...previous.tags, ...asset.tags, ...previous.name.split(' / '), ...asset.name.split(' / '), previous.url, asset.url, previous.sourceUrl, asset.sourceUrl])]
    previous.name = [...new Set([...previous.name.split(' / '), asset.name])].join(' / ')
    previous.recordCount += asset.recordCount
  }
  return officialMapAssetCatalogSchema.parse({ ...catalog, assets: [...merged.values()] })
}

const categories: Record<string, OfficialAssetCategory> = {
  探索: 'exploration', 挑战: 'challenge', NPC及服务点: 'service',
}

export function normalizeMapAssets(
  payloads: readonly { state: { id: number }; catalogData: unknown }[],
  resourceHash: string,
  fetchedAt: string,
): OfficialMapAssetCatalog {
  const assets = new Map<string, OfficialAsset>()
  for (const { state, catalogData } of payloads) {
    for (const rawCategory of asArray(catalogData, 'map asset categories')) {
      const group = asRecord(rawCategory, 'map asset category')
      const categoryName = asString(group.name)
      const selectedCategory = categories[categoryName]
      if (!selectedCategory) continue
      const category = selectedCategory
      const categoryId = asString(group.id)
      function visit(values: unknown): void {
        for (const value of asArray(values, 'map asset entries')) {
          const entry = asRecord(value, 'map asset entry')
          const typeId = asString(entry.id)
          const name = asString(entry.name).trim()
          const url = iconUrl(entry.icon)
          if (url) {
            if (!typeId || !name) throw new Error('官方地图目录缺少类型 ID 或名称')
            // The official category IDs differ across maps; use the semantic category.
            const id = `map-catalog:${category}:${url}:${name}`
            const previous = assets.get(id)
            if (previous) {
              if (!previous.stateIds.includes(state.id)) previous.stateIds.push(state.id)
              if (!previous.tags.includes(categoryId)) previous.tags.push(categoryId)
              if (!previous.referenceIds.includes(typeId)) previous.referenceIds.push(typeId)
            } else {
              assets.set(id, {
                id, category, categories: [category], name, url, previewUrl: url,
                sourceUrl: `${STATIC_ROOT}/mcmap/catalog/${resourceHash}/${state.id}/catalog.json`,
                fetchedAt, stateIds: [state.id], referenceIds: [typeId],
                tags: [categoryName, categoryId, asString(entry.tableName), typeId].filter(Boolean),
                recordCount: 1,
              })
            }
          } else if (!Array.isArray(entry.children) || entry.children.length === 0) {
            throw new Error(`官方地图目录条目缺少图标：${categoryName}/${name}`)
          }
          if (Array.isArray(entry.children) && entry.children.length) visit(entry.children)
        }
      }
      visit(group.children)
    }
  }
  return officialMapAssetCatalogSchema.parse({
    version: 1, resourceHash,
    assets: [...assets.values()].map((asset) => ({ ...asset, stateIds: asset.stateIds.sort((a, b) => a - b) })),
  })
}
