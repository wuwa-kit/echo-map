import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { assetCategories, buildOfficialAssets, filterOfficialAssets } from '../src/domain/official-assets.ts'
import { officialAssetSchema } from '../src/domain/schema.ts'
import { officialFloorTileUrl, officialTileUrl, tilePreviewUrl } from '../src/data/official-asset-urls.ts'
import { ASSET_PAGE_SIZE, useAssetsStore } from '../src/stores/assets.ts'
import { referenceDataset } from './fixtures/point-library.ts'
import { splitMapDataset } from '../scripts/lib/map-data.ts'

const assets = buildOfficialAssets(referenceDataset)
const { map, catalog, locations } = splitMapDataset(referenceDataset)
const officialData = { locations, library: { version: 1, points: [] } }

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
    expect(assetCategories.map(({ id }) => id)).toEqual(['echo', 'sonata', 'navigation', 'tile', 'floor', 'gravity'])
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

  it('merges shared URLs while preserving map associations, source IDs and distinct variants', () => {
    const point = referenceDataset.navigationPoints[0]!
    const otherState = referenceDataset.states.find(({ id }) => id !== point.stateId)!
    const dataset = {
      ...referenceDataset,
      navigationPoints: [
        point,
        { ...point, id: 'other', typeId: 'other-type', typeName: '另一种地标', stateId: otherState.id },
        { ...point, id: 'variant', iconUrl: 'https://web-static.kurobbs.com/variant.png' },
        { ...point, id: 'missing', iconUrl: '' },
        { ...point, id: 'unsafe', iconUrl: 'javascript:alert(1)' },
      ],
    }
    const icons = buildOfficialAssets(dataset).filter(({ category }) => category === 'navigation')
    expect(icons).toHaveLength(2)
    const shared = icons.find(({ url }) => url === point.iconUrl)!
    expect(shared.recordCount).toBe(2)
    expect(shared.referenceIds).toEqual([point.typeId, 'other-type'])
    expect(shared.stateIds).toEqual([point.stateId, otherState.id].sort((a, b) => a - b))
    expect(shared.tags).toContain('另一种地标')
    expect(shared.sourceUrl).toBe(dataset.source.sourceUrls.officialMap)
    expect(shared.fetchedAt).toBe(dataset.source.mapFetchedAt)
    expect(buildOfficialAssets({ ...dataset, navigationPoints: [...dataset.navigationPoints].reverse() }).map(({ id }) => id).sort()).toEqual(buildOfficialAssets(dataset).map(({ id }) => id).sort())
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
  it('validates URL state against the current dataset and bounds pagination', () => {
    const store = useAssetsStore()
    store.setDataset(referenceDataset)
    store.restoreQuery({ category: ['echo'], map: '999999', page: 'Infinity', asset: 'missing' })
    expect(store.filters).toEqual({ category: 'all', stateId: null, page: 1, selectedId: null })
    store.restoreQuery({ category: 'tile', map: '8', page: '999999' })
    expect(store.filters.category).toBe('tile')
    expect(store.page).toBe(store.pageCount)
    expect(store.pageAssets.every(({ category, stateIds }) => category === 'tile' && stateIds.includes(8))).toBe(true)
    store.restoreQuery({ category: 'echo', page: '0', asset: assets[0]!.id })
    expect(store.page).toBe(1)
    expect(store.selectedAsset?.id).toBe(assets[0]!.id)
    store.restoreQuery({ category: 'map-echo', asset: 'map-echo:old-icon' })
    expect(store.filters.category).toBe('all')
    expect(store.selectedAsset).toBeNull()
  })

  it('resets pages when filtering, clears incompatible selection and preserves immutable snapshots', () => {
    const store = useAssetsStore()
    store.setDataset(referenceDataset)
    store.selectPage(2)
    expect(store.pageAssets).toHaveLength(ASSET_PAGE_SIZE)
    const snapshot = store.filters
    store.selectAsset(assets[0]!.id)
    store.selectCategory('sonata')
    expect(store.filters).toEqual({ category: 'sonata', stateId: null, page: 1, selectedId: null })
    expect(snapshot.page).toBe(2)
    expect(snapshot.selectedId).toBeNull()
    expect(Object.isFrozen(store.dataset?.echoes)).toBe(true)
    expect(Object.isFrozen(store.assets[0])).toBe(true)
    store.setSearch('no-such-asset')
    expect(store.pageAssets).toEqual([])
    expect(store.pageCount).toBe(1)
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
      .mockResolvedValueOnce(new Response(JSON.stringify(officialData)))
      .mockResolvedValueOnce(new Response(JSON.stringify(map)))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
      .mockResolvedValueOnce(new Response(JSON.stringify(officialData)))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const store = useAssetsStore()
      await store.load()
      expect(store.error).toContain('503')
      expect(store.loading).toBe(false)
      await store.load()
      expect(store.error).toBe('')
      expect(store.assets).toHaveLength(assets.length)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('shares an in-flight load when the page is reopened before the first request finishes', async () => {
    const response = Promise.withResolvers<Response>()
    const fetchMock = vi.fn<typeof fetch>()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
      .mockResolvedValueOnce(new Response(JSON.stringify(officialData)))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const store = useAssetsStore()
      const firstLoad = store.load()
      const secondLoad = store.load()
      expect(fetchMock).toHaveBeenCalledTimes(3)
      response.resolve(new Response(JSON.stringify(map)))
      await Promise.all([firstLoad, secondLoad])
      expect(store.loading).toBe(false)
      expect(store.assets).toHaveLength(assets.length)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
