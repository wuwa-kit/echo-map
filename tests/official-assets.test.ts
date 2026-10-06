import { deduplicateMapAssets, normalizeMapAssets } from '../scripts/lib/map/asset-catalog.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { assetCategories, buildOfficialAssets, filterOfficialAssets } from '../src/domain/official-assets.ts'
import { officialAssetSchema } from '../src/domain/schema.ts'
import { officialFloorTileUrl, officialTileUrl, tilePreviewUrl } from '../src/data/official-asset-urls.ts'
import { useAssetsStore } from '../src/stores/assets.ts'
import { referenceDataset } from './fixtures/point-library.ts'
import { splitMapDataset } from '../scripts/lib/map-data.ts'
import { PNG } from 'pngjs'
import { navigationPoint } from './fixtures/navigation-points.ts'

const mapAssets = normalizeMapAssets([{ state: { id: 8 }, catalogData: [
  { id: 'ts', name: '探索', children: [{ id: 'puzzle', name: '探索谜题', icon: 'icons/shared.png' }, { id: 'race', name: '竞速挑战', icon: 'icons/shared.png' }] },
  { id: '8', name: '挑战', children: [{ id: 'domain', name: '挑战副本', icon: 'icons/domain.png', count: 0 }] },
  { id: '9', name: 'NPC及服务点', children: [{ id: 'npc', name: '服务 NPC', icon: 'icons/npc.png' }] },
] }], 'fixture-hash', '2026-10-01T00:00:00.000Z')
const assets = buildOfficialAssets(referenceDataset)
const { map, catalog, locations } = splitMapDataset(referenceDataset)
const officialEchoData = { locations: locations.echoLocations, library: { version: 1, points: [] } }

beforeEach(() => { setActivePinia(createPinia()) })

describe('official asset catalogue', () => {
  it('covers every icon URL and tile path in the snapshot without duplicate category/URL pairs', () => {
    expect(assets.every((asset) => officialAssetSchema.safeParse(asset).success)).toBe(true)
    expect(new Set(assets.map(({ id }) => id)).size).toBe(assets.length)
    const categories = [
      ['echo', referenceDataset.echoes], ['sonata', referenceDataset.sonatas],
      ['navigation', referenceDataset.navigationPoints],
    ] as const
    for (const [category, records] of categories) {
      const urls = new Set(records.map(({ iconUrl }) => iconUrl).filter(Boolean))
      expect(new Set(assets.filter((asset) => asset.category === category).map(({ url }) => url))).toEqual(urls)
      expect(assets.filter((asset) => asset.category === category).reduce((sum, asset) => sum + asset.recordCount, 0)).toBe(records.filter(({ iconUrl }) => iconUrl).length)
    }
    expect(assets.filter(({ category }) => category === 'tile')).toHaveLength(referenceDataset.states.reduce((sum, state) => sum + state.tileIds.length, 0))
    const floorUrls = referenceDataset.states.flatMap((state) => state.layeredMaps.flatMap((layer) => layer.floors.flatMap((floor) => floor.tiles.map((path) => officialFloorTileUrl(referenceDataset.source.mapResourceHash, state.id, path)))))
    expect(new Set(assets.filter(({ category }) => category === 'floor').map(({ url }) => url))).toEqual(new Set(floorUrls))
  })

  it('finds every catalogue echo by its Chinese name even without official map locations', () => {
    const catalogueAssets = buildOfficialAssets({ ...referenceDataset, echoLocations: [] })
    expect(assetCategories.map(({ id }) => id)).toEqual(['echo', 'sonata', 'navigation', 'exploration', 'challenge', 'service', 'tile', 'floor', 'gravity'])
    const echoAssets = catalogueAssets.filter(({ category }) => category === 'echo')
    expect(echoAssets).toHaveLength(new Set(referenceDataset.echoes.map(({ iconUrl }) => iconUrl)).size)
    expect(echoAssets.reduce((sum, asset) => sum + asset.recordCount, 0)).toBe(referenceDataset.echoes.length)
    for (const echo of referenceDataset.echoes) {
      expect(filterOfficialAssets(catalogueAssets, 'echo', null, echo.name)).toContainEqual(expect.objectContaining({
        url: echo.iconUrl, sourceUrl: referenceDataset.source.sourceUrls.echoCatalogue,
        referenceIds: expect.arrayContaining([String(echo.sourceId)]),
      }))
    }
  })

  it('reads navigation names solely from the asset catalogue, independently of map points', () => {
    const icon = mapAssets.assets[0]!
    const navigationAsset = { ...icon, categories: ['navigation' as const], name: '测试定位点资产' }
    const dataset = { ...referenceDataset, navigationPoints: [navigationPoint()] }
    expect(buildOfficialAssets(dataset).filter(({ category }) => category === 'navigation')).toEqual([])
    const assets = buildOfficialAssets(dataset, [navigationAsset])
    expect(filterOfficialAssets(assets, 'navigation', 8, '测试定位点资产')).toHaveLength(1)
    expect(buildOfficialAssets({ ...dataset, navigationPoints: [] }, [navigationAsset])).toEqual(assets)
  })

  it('builds original and preview tile URLs with negative coordinates and nested floors', () => {
    const url = officialTileUrl('HASH', 8, '8_-3_4')
    expect(url).toBe('https://web-static.kurobbs.com/mcmap/tiles/HASH/8/8_-3_4.png')
    expect(tilePreviewUrl(url, 320)).toBe(`${url}?x-oss-process=image/format,webp/resize,w_320,h_320`)
    expect(officialFloorTileUrl('HASH', 8, '/1/-2/3_-4.png')).toBe('https://web-static.kurobbs.com/mcmap/tiles/HASH/8/1/-2/3_-4.png')
  })

  it('combines category, map and multi-term searches across names, IDs, sonatas and paths', () => {
    const echo = referenceDataset.echoes.find(({ id }) => referenceDataset.echoLocations.some(({ echoId }) => echoId === id))!
    const location = referenceDataset.echoLocations.find(({ echoId }) => echoId === echo.id)!
    const sonata = referenceDataset.sonatas.find(({ id }) => id === echo.sonataIds[0])!
    expect(filterOfficialAssets(assets, 'echo', location.stateId, `${echo.name} ${sonata.name}`)).toContainEqual(expect.objectContaining({ name: echo.name }))
    expect(filterOfficialAssets(assets, 'echo', null, String(echo.sourceId))).toContainEqual(expect.objectContaining({ name: echo.name }))
    const floor = assets.find(({ category }) => category === 'floor')!
    expect(filterOfficialAssets(assets, 'floor', floor.stateIds[0]!, floor.referenceIds[0]!)).toContainEqual(floor)
    expect(filterOfficialAssets(assets, 'navigation', null, `${echo.name} no-such-asset`)).toEqual([])
    expect(filterOfficialAssets(assets, 'all', -1, '')).toEqual([])
  })
})

describe('asset browser state', () => {
  it('navigates only the current results without wrapping or replacing the grid data', () => {
    const store = useAssetsStore()
    store.setDataset(referenceDataset)
    store.selectCategory('echo')
    store.selectMap(8)
    store.setSearch('C1')
    const results = store.filteredAssets
    const categories = store.categories
    const [first, second] = results
    const last = results.at(-1)
    if (!first || !second || !last) throw new Error('测试数据缺少当前地图的 C1 声骸')

    store.selectAdjacentAsset(1)
    expect(store.selectedAsset).toBeNull()
    store.selectAsset(first.id)
    expect(store.selectedIndex).toBe(0)
    store.selectAdjacentAsset(-1)
    expect(store.selectedAsset?.id).toBe(first.id)
    store.selectAdjacentAsset(1)
    expect(store.selectedAsset?.id).toBe(second.id)
    store.selectAdjacentAsset(-1)
    expect(store.selectedAsset?.id).toBe(first.id)
    store.selectAsset(last.id)
    store.selectAdjacentAsset(1)
    expect(store.selectedIndex).toBe(results.length - 1)
    expect(store.selectedAsset?.id).toBe(last.id)
    store.selectAsset(null)
    expect(store.selectedIndex).toBe(-1)
    expect(store.selectedAsset).toBeNull()
    expect(store.filteredAssets).toBe(results)
    expect(store.categories).toBe(categories)
    expect(store.filters).toEqual({ category: 'echo', stateId: 8, selectedId: null })
    expect(store.search).toBe('C1')
  })

  it('handles one result and clears the selection when searching excludes it', () => {
    const store = useAssetsStore()
    store.setDataset(referenceDataset)
    store.selectCategory('sonata')
    const asset = store.filteredAssets[0]
    if (!asset) throw new Error('测试数据缺少合鸣效果')
    store.setSearch(asset.url)
    expect(store.filteredAssets).toHaveLength(1)
    store.selectAsset(asset.id)
    for (const direction of [-1, 1] as const) {
      store.selectAdjacentAsset(direction)
      expect(store.selectedAsset?.id).toBe(asset.id)
    }
    store.setSearch('no-such-asset')
    expect(store.filters.selectedId).toBeNull()
    store.selectAsset(asset.id)
    store.selectAdjacentAsset(1)
    expect(store.selectedAsset).toBeNull()
    expect(store.selectedIndex).toBe(-1)
  })

  it('restores a detail link only when the asset belongs to the restored scope', () => {
    const store = useAssetsStore()
    store.setDataset(referenceDataset)
    const tile = assets.find(({ category, stateIds }) => category === 'tile' && stateIds.includes(8))
    if (!tile) throw new Error('测试数据缺少地图 8 瓦片')
    store.restoreQuery({ category: 'tile', map: '8', asset: tile.id })
    expect(store.selectedAsset?.id).toBe(tile.id)
    expect(store.selectedIndex).toBeGreaterThanOrEqual(0)
    store.restoreQuery({ category: 'echo', map: '8', asset: tile.id })
    expect(store.filters.selectedId).toBeNull()
    store.restoreQuery({ category: 'tile', map: '903', asset: tile.id })
    expect(store.filters.selectedId).toBeNull()
  })

  it('validates URL state against the current dataset', () => {
    const store = useAssetsStore()
    store.setDataset(referenceDataset)
    store.restoreQuery({ category: ['echo'], map: '999999', page: 'Infinity', asset: 'missing' })
    expect(store.filters).toEqual({ category: 'all', stateId: null, selectedId: null })
    store.restoreQuery({ category: 'tile', map: '8', page: '999999' })
    expect(store.filters.category).toBe('tile')
    expect(store.filteredAssets.every(({ category, stateIds }) => category === 'tile' && stateIds.includes(8))).toBe(true)
    store.restoreQuery({ category: 'echo', page: '0', asset: assets[0]!.id })
    expect(store.selectedAsset?.id).toBe(assets[0]!.id)
    store.restoreQuery({ category: 'map-echo', asset: 'map-echo:old-icon' })
    expect(store.filters.category).toBe('all')
    expect(store.selectedAsset).toBeNull()
  })

  it('filters the complete list, clears incompatible selection and preserves immutable snapshots', () => {
    const store = useAssetsStore()
    store.setDataset(referenceDataset)
    const snapshot = store.filters
    store.selectAsset(assets[0]!.id)
    store.selectCategory('sonata')
    expect(store.filters).toEqual({ category: 'sonata', stateId: null, selectedId: null })
    expect(snapshot.selectedId).toBeNull()
    expect(Object.isFrozen(store.dataset?.echoes)).toBe(true)
    expect(Object.isFrozen(store.assets[0])).toBe(true)
    store.setSearch('no-such-asset')
    expect(store.filteredAssets).toEqual([])
    store.resetFilters()
    expect(store.search).toBe('')
    expect(store.filteredAssets).toHaveLength(assets.length)
    store.selectMap(8)
    expect(store.filteredAssets.every(({ stateIds }) => stateIds.includes(8))).toBe(true)
    store.selectMap(999999)
    expect(store.filters.stateId).toBeNull()
  })

  it('reports data load errors and can retry successfully', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503, statusText: 'Unavailable' }))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
      .mockResolvedValueOnce(new Response(JSON.stringify(officialEchoData)))
      .mockResolvedValueOnce(new Response(JSON.stringify(mapAssets)))
      .mockResolvedValueOnce(new Response(JSON.stringify(map)))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
      .mockResolvedValueOnce(new Response(JSON.stringify(officialEchoData)))
      .mockResolvedValueOnce(new Response(JSON.stringify(mapAssets)))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const store = useAssetsStore()
      await store.load()
      expect(store.error).toContain('503')
      expect(store.loading).toBe(false)
      await store.load()
      expect(store.error).toBe('')
      expect(store.assets).toHaveLength(assets.length + mapAssets.assets.length)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('shares an in-flight load when the page is reopened before the first request finishes', async () => {
    const response = Promise.withResolvers<Response>()
    const fetchMock = vi.fn<typeof fetch>()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
      .mockResolvedValueOnce(new Response(JSON.stringify(officialEchoData)))
      .mockResolvedValueOnce(new Response(JSON.stringify(mapAssets)))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const store = useAssetsStore()
      const firstLoad = store.load()
      const secondLoad = store.load()
      expect(fetchMock).toHaveBeenCalledTimes(4)
      response.resolve(new Response(JSON.stringify(map)))
      await Promise.all([firstLoad, secondLoad])
      expect(store.loading).toBe(false)
      expect(store.assets).toHaveLength(assets.length + mapAssets.assets.length)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})


describe('complete official map categories', () => {
  it('collects navigation names by catalog ID and table even when no location exists', () => {
    const catalogData = [
      { id: 'ts', name: '探索', children: [
        { id: 'CS_01', name: '中枢信标', icon: 'beacon.png', count: 0 },
        { id: 'other', name: '中枢信标', icon: 'other.png' },
      ] },
      { id: 'boss', name: 'BOSS', children: [{ id: '5034', name: '罗蕾莱', icon: 'boss.png' }] },
      { id: '8', name: '挑战', children: [{ id: 'new-challenge', name: '新挑战', icon: 'challenge.png', tableName: '大地图-副本挑战' }] },
      { id: '9', name: 'NPC及服务点', children: [{ id: 'new-service', name: '新服务', icon: 'service.png', tableName: '大地图-NPC' }] },
    ]
    const catalog = normalizeMapAssets([{ state: { id: 8 }, catalogData }], 'hash', '2026-10-01', {
      types: {}, includeTableNames: { '大地图-副本挑战': 'material-domain', '大地图-NPC': 'service' },
    })
    expect(filterOfficialAssets(catalog.assets, 'navigation', null, '').map(({ name }) => name)).toEqual(['中枢信标', '罗蕾莱', '新挑战', '新服务'])
    expect(catalog.assets.every((asset) => !('coordinate' in asset) && !('location' in asset))).toBe(true)
  })

  it('preserves catalogue names, categories and alternate URLs without location records', () => {
    const icon = mapAssets.assets[0]!
    const alternateUrl = 'https://example.com/alternate.png'
    const catalogIcon = {
      ...icon, name: '隐海修会 / 埃弗拉德金库', categories: [...icon.categories, 'navigation' as const],
      tags: [...icon.tags, alternateUrl], referenceIds: [...icon.referenceIds, 'other-type'],
    }
    const combined = buildOfficialAssets(referenceDataset, [catalogIcon])
    const navigation = filterOfficialAssets(combined, 'navigation', null, '')
    expect(navigation).toHaveLength(1)
    expect(filterOfficialAssets(combined, 'all', null, '隐海修会')).toEqual(navigation)
    expect(filterOfficialAssets(combined, 'exploration', null, '埃弗拉德金库')).toEqual(navigation)
    expect(navigation[0]?.referenceIds).toContain('other-type')
    expect(navigation[0]?.tags).toContain(alternateUrl)
    expect(icon.categories).toEqual(['exploration'])
  })

  it('merges identical pixels across names and categories while preserving distinct images', async () => {
    const original = mapAssets.assets[0]!
    const duplicate = { ...original, id: 'duplicate', url: 'https://example.com/duplicate.png', referenceIds: ['other-id'], stateIds: [903] }
    const variant = { ...original, id: 'variant', url: 'https://example.com/variant.png' }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const image = new PNG({ width: 2, height: 1 })
      image.data.fill(255)
      image.data[0] = String(url).includes('variant') ? 0 : 255
      image.data[4] = String(url).includes('duplicate') ? 17 : 255
      image.data[7] = 0
      return new Response(new Uint8Array(PNG.sync.write(image)))
    }))
    try {
      const result = await deduplicateMapAssets({ ...mapAssets, assets: [...mapAssets.assets, duplicate, variant] })
      expect(result.assets).toHaveLength(2)
      const shared = result.assets.find(({ id }) => id === original.id)!
      expect(shared.stateIds).toEqual([8, 903])
      expect(shared.referenceIds).toContain('other-id')
      expect(shared.tags).toContain(duplicate.url)
      expect(shared.recordCount).toBe(5)
      expect(shared.categories).toEqual(['exploration', 'challenge', 'service'])
      expect(shared.name).toContain('竞速挑战')
      expect(filterOfficialAssets(result.assets, 'service', 8, '服务 NPC')).toEqual([shared])
      expect(filterOfficialAssets(result.assets, 'exploration', 8, '竞速挑战')).toEqual([shared])
      expect(result.assets.some(({ id }) => id === 'variant')).toBe(true)
      expect(original.stateIds).toEqual([8])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('includes zero-count entries and preserves different names sharing one image', () => {
    const expanded = buildOfficialAssets(referenceDataset, mapAssets.assets)
    expect(filterOfficialAssets(expanded, 'exploration', 8, '').map(({ name }) => name)).toEqual(['探索谜题', '竞速挑战'])
    expect(filterOfficialAssets(expanded, 'challenge', 8, '挑战副本')).toHaveLength(1)
    expect(filterOfficialAssets(expanded, 'service', 8, '服务 NPC')).toHaveLength(1)
    expect(expanded.filter(({ category }) => category === 'navigation')).toEqual(assets.filter(({ category }) => category === 'navigation'))
    expect(mapAssets.assets.every((asset) => officialAssetSchema.safeParse(asset).success)).toBe(true)
  })

  it('merges repeated catalog entries across states and rejects incomplete categories', () => {
    const catalogData = [
      { id: 'ts', name: '探索', children: [{ id: 'a', name: '入口', icon: 'icons/a.png' }] },
      { id: '8', name: '挑战', children: [{ id: 'b', name: '挑战', icon: 'icons/b.png' }] },
      { id: '9', name: 'NPC及服务点', children: [{ id: 'c', name: '商店', icon: 'icons/c.png' }] },
      { id: '6', name: '敌人', children: [{ id: 'd', name: '不收录', icon: 'icons/d.png' }] },
    ]
    const result = normalizeMapAssets([{ state: { id: 8 }, catalogData }, { state: { id: 903 }, catalogData: catalogData.map((category) => ({ ...category, id: `other-${category.id}` })) }], 'hash', '2026-10-01')
    for (const asset of result.assets) Object.freeze(asset.stateIds)
    expect(buildOfficialAssets(referenceDataset, result.assets).filter(({ category }) => category === 'exploration')).toHaveLength(1)
    expect(result.assets).toHaveLength(3)
    expect(result.assets.every(({ stateIds }) => stateIds.join(',') === '8,903')).toBe(true)
    expect(() => normalizeMapAssets([{ state: { id: 8 }, catalogData: [] }], 'hash', '2026-10-01')).toThrow()
  })
})
