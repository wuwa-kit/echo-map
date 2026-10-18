import { expect, it } from 'vitest'
import { mapNormalBossIcons } from '../scripts/lib/map/normal-boss-icons.ts'
import type { OfficialMapAssetCatalog } from '../src/domain/types.ts'
import { officialMapAssetCatalogSchema } from '../src/domain/schema.ts'
import catalogJson from '../public/data/map-asset-catalog.json' with { type: 'json' }

it('refreshes normal boss names and artwork by official map reference ID', () => {
  const catalog = officialMapAssetCatalogSchema.parse(catalogJson)
  const source = catalog.assets.find(asset => asset.referenceIds.includes('340000150'))
  if (!source) throw new Error('缺少官方芬莱克资源')
  const updated: OfficialMapAssetCatalog = { ...catalog, assets: [{ ...source, name: '芬莱克新名称', url: 'https://web-static.kurobbs.com/updated.png' }] }
  expect(mapNormalBossIcons(updated)).toEqual([{ id: 'map-boss-340000150', name: '芬莱克新名称', url: 'https://web-static.kurobbs.com/updated.png', source: 'map', replacesIconId: 'wiki-echo-17409' }])
})

it('retains the previous official map resource when a partial catalogue omits it', () => {
  expect(mapNormalBossIcons({ version: 1, resourceHash: 'partial', assets: [] })[0]).toMatchObject({ name: '芬莱克', source: 'map' })
})
