import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { officialMapAssetCatalogSchema } from '../src/domain/schema.ts'
import { buildOfficialAssets } from '../src/domain/official-assets.ts'
import { navigationIconAssets } from '../src/domain/navigation-icons.ts'
import { authoredPointMapDisplay, parsePointLibrary } from '../src/domain/point-library.ts'
import { referenceDataset } from './fixtures/point-library.ts'

const catalog = officialMapAssetCatalogSchema.parse(JSON.parse(readFileSync(new URL('../public/data/map-asset-catalog.json', import.meta.url), 'utf8')))
const icons = navigationIconAssets(buildOfficialAssets(referenceDataset, catalog.assets))
describe('navigation icon picker', () => {
  it('includes all map icon categories but excludes unrelated assets', () => {
    for (const category of ['navigation', 'exploration', 'challenge', 'service'] as const) {
      expect(icons.some((asset) => asset.categories.includes(category))).toBe(true)
    }
    expect(icons.some((asset) => asset.categories.some((category) => ['tile', 'floor', 'echo', 'sonata'].includes(category)))).toBe(false)
    expect(new Set(icons.map(({ url }) => url)).size).toBe(icons.length)
  })
  it('matches every child name of a merged icon', () => {
    const merged = icons.find((asset) => asset.name.split(' / ').length > 1)
    expect(merged).toBeDefined()
    if (!merged) return
    for (const name of merged.name.split(' / ')) {
      expect(navigationIconAssets(icons, name).some(({ id }) => id === merged.id)).toBe(true)
    }
    expect(navigationIconAssets(icons, '不存在的图标名称xyz')).toEqual([])
  })
  it('moves only the first matching child name to the front without changing source data', () => {
    const source = icons[0]
    if (!source) throw new Error('缺少测试图标')
    const asset = { ...source, name: '商店 / NPC甲 / 信标 / NPC乙' }
    expect(navigationIconAssets([asset], ' npc ')[0]?.name).toBe('NPC甲 / 商店 / 信标 / NPC乙')
    expect(navigationIconAssets([asset], '信标')[0]?.name).toBe('信标 / 商店 / NPC甲 / NPC乙')
    expect(navigationIconAssets([asset], '商店')[0]?.name).toBe(asset.name)
    expect(navigationIconAssets([asset], '')[0]?.name).toBe('商店 / NPC甲 / 信标 / NPC乙')
    expect(asset.name).toBe('商店 / NPC甲 / 信标 / NPC乙')
  })
  it('preserves catalog-only icons through validation and map rendering', () => {
    const asset = icons.find((asset) => !asset.categories.includes('navigation'))
    if (!asset) throw new Error('缺少目录图标')
    const point = {
      gravityType: null, id: 'asset-icon', kind: 'navigation' as const, status: 'verified' as const,
      stateId: 8, countryId: null, levelId: null, coordinate: { x: 1, y: 2, z: 3 },
      name: '自选图标', navigationKind: 'landmark' as const, mode: 'landmark' as const, note: '', iconUrl: asset.url,
    }
    const library = parsePointLibrary({ version: 1, points: [point] }, referenceDataset, 'manual')
    const saved = library.points[0]
    if (!saved) throw new Error('缺少保存点位')
    expect(authoredPointMapDisplay(saved, referenceDataset)?.location.iconUrl).toBe(asset.url)
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconUrl: 'javascript:alert(1)' }] }, referenceDataset)).toThrow()
  })
})
