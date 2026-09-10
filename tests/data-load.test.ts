import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadMapDataset, loadPointLibrary } from '../src/data/load.ts'
import { readOfficialPointData, splitMapDataset } from '../scripts/lib/map-data.ts'
import { referenceDataset, mixedPoint } from './fixtures/point-library.ts'
import { assembleMapDataset } from '../src/domain/map-data.ts'

const { map, catalog } = splitMapDataset(referenceDataset)
const official = await readOfficialPointData(referenceDataset)
const emptyLibrary = { version: 1 as const, points: [] }

afterEach(() => vi.unstubAllGlobals())

describe('split application data loading', () => {
  it('deduplicates navigation icon definitions while preserving variants of the same official type', () => {
    const first = referenceDataset.navigationPoints[0]
    if (!first) throw new Error('测试数据缺少定位点')
    const dataset = {
      ...referenceDataset,
      navigationPoints: [first, { ...first, id: 'same-icon' }, { ...first, id: 'icon-variant', iconUrl: `${first.iconUrl}?variant=1` }],
    }
    const split = splitMapDataset(dataset)
    expect(split.locations.navigationPoints[0]?.iconId).toBe(split.locations.navigationPoints[1]?.iconId)
    expect(split.locations.navigationPoints[0]?.iconId).not.toBe(split.locations.navigationPoints[2]?.iconId)
    expect(assembleMapDataset(split.map, split.catalog, split.locations)).toEqual(dataset)
    const reordered = splitMapDataset({ ...dataset, navigationPoints: [...dataset.navigationPoints].reverse() })
    expect(reordered.catalog.pointIcons).toEqual(split.catalog.pointIcons)
  })

  it('discards map echo icons and restores portraits solely from the catalogue', () => {
    const first = referenceDataset.echoLocations[0]
    const echo = referenceDataset.echoes.find(({ id }) => id === first?.echoId)
    if (!first || !echo) throw new Error('测试数据缺少声骸图鉴')
    const split = splitMapDataset({
      ...referenceDataset, navigationPoints: [],
      echoLocations: [{ ...first, iconUrl: 'https://example.test/obsolete-map-echo.png' }],
    })
    expect(split.catalog.pointIcons).toEqual([])
    expect(split.locations.echoLocations[0]).not.toHaveProperty('iconUrl')
    expect(split.locations.echoLocations[0]).not.toHaveProperty('iconId')
    expect(assembleMapDataset(split.map, split.catalog, split.locations).echoLocations).toEqual([{ ...first, iconUrl: echo.iconUrl }])
  })

  it('loads each file once and preserves source coordinates, icons and manual XYZ', async () => {
    const responses = new Map<string, unknown>([
      ['/data/map-data.json', map],
      ['/data/catalog-data.json', catalog],
      ['/data/official-echo-points.json', official.echo],
      ['/data/official-navigation-points.json', official.navigation],
      ['/data/custom-echo-points.json', { version: 1, points: [mixedPoint()] }],
      ['/data/custom-navigation-points.json', emptyLibrary],
    ])
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const body = responses.get(String(url))
      if (!body) throw new Error(`Unexpected data request: ${String(url)}`)
      return new Response(JSON.stringify(body))
    })
    vi.stubGlobal('fetch', fetchMock)
    const pending = loadMapDataset()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/data/map-data.json', '/data/catalog-data.json', '/data/official-echo-points.json', '/data/official-navigation-points.json',
    ])
    const { dataset, officialLibrary } = await pending
    expect(dataset).toEqual(referenceDataset)
    expect(officialLibrary.points).toEqual([...official.echo.library.points, ...official.navigation.library.points])
    expect(await loadPointLibrary(dataset)).toEqual({ version: 1, points: [mixedPoint()] })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/data/map-data.json', '/data/catalog-data.json', '/data/official-echo-points.json', '/data/official-navigation-points.json',
      '/data/custom-echo-points.json', '/data/custom-navigation-points.json',
    ])
  })

  it('allows absent official files without falling back to old map points', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(map)))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 })))
    const { dataset, officialLibrary } = await loadMapDataset()
    expect(dataset.states).toEqual(referenceDataset.states)
    expect(dataset.echoLocations).toEqual([])
    expect(dataset.navigationPoints).toEqual([])
    expect(officialLibrary.points).toEqual([])
  })

  it('preserves reference metadata when the official library is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(map)))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...official.echo, library: emptyLibrary })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...official.navigation, library: emptyLibrary }))))
    const { dataset, officialLibrary } = await loadMapDataset()
    expect(dataset).toEqual(referenceDataset)
    expect(officialLibrary.points).toEqual([])
  })

  it('reports official server failures instead of treating them as an empty library', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(map)))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(official.navigation))))
    await expect(loadMapDataset()).rejects.toThrow('官方声骸点位加载失败：503')
  })

  it('reports an unavailable catalogue and rejects missing icon references', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(map)))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(official.echo)))
      .mockResolvedValueOnce(new Response(JSON.stringify(official.navigation))))
    await expect(loadMapDataset()).rejects.toThrow('图鉴与图标数据加载失败：404')

    const first = official.navigation.locations[0]
    if (!first) throw new Error('测试数据缺少定位点')
    const invalid = { ...official.navigation, locations: [{ ...first, iconId: 'missing-icon' }] }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(map)))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
      .mockResolvedValueOnce(new Response(JSON.stringify(official.echo)))
      .mockResolvedValueOnce(new Response(JSON.stringify(invalid))))
    await expect(loadMapDataset()).rejects.toThrow('不存在的图标 missing-icon')
  })

  it('rejects official points that reference an unknown echo after merging the map data', async () => {
    const invalid = {
      ...mixedPoint(), status: 'imported', officialIds: ['source'], coordinate: { x: 1, y: 2, z: 0 },
      members: [{ echoId: 'unknown-echo', count: 1 }],
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(map)))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...official.echo, library: { version: 1, points: [invalid] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify(official.navigation))))
    await expect(loadMapDataset()).rejects.toThrow('白名单外声骸')
  })
})
