import { writePointLibrary } from '../scripts/lib/point-files.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { syncMap } from '../scripts/sync-map.ts'
import { fetchBytes, fetchJson, fetchOptionalJson, postFormJson } from '../scripts/lib/http.ts'
import { readJson, writeJson } from '../scripts/lib/files.ts'
import { splitMapDataset } from '../scripts/lib/map-data.ts'
import { catalog, countries, iconBytes, layers, manual, navigationConfig, positions, wiki } from './fixtures/sync-map-input.ts'

vi.mock('../scripts/lib/http.ts')
vi.mock('../scripts/lib/point-files.ts', () => ({
  readPointLibrary: vi.fn(async () => ({ version: 1, points: [] })),
  writePointLibrary: vi.fn(),
}))
vi.mock('../scripts/lib/official-point-library.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../scripts/lib/official-point-library.ts')>(),
  readOfficialPointLibrary: vi.fn(async () => ({ version: 1, points: [] })),
}))
vi.mock('../scripts/lib/files.ts', () => ({
  isMainModule: () => false,
  projectPath: (...parts: string[]) => parts.join('/'),
  readJson: vi.fn(),
  writeJson: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(readJson).mockImplementation(async (path) => {
    if (path.endsWith('wiki.json')) return wiki
    if (path.endsWith('locations.json')) return manual
    if (path.endsWith('map-echo-aliases.json')) return { byTypeId: { '2': '乙' } }
    if (path.endsWith('map-navigation-types.json')) return navigationConfig
    throw new Error(`未预期的输入：${path}`)
  })
  vi.mocked(postFormJson).mockImplementation(async (url) => ({
    data: url.endsWith('getMapResource') ? 'test-resource-hash' : { '8': ['8_0_1'], '9': [] },
  }))
  vi.mocked(fetchJson).mockImplementation(async (url) => {
    if (url.endsWith('catalogRelation.json')) {
      return [{ id: 'C_100', children: wiki.sonatas.map(({ name }, index) => ({ id: String(index + 1), name })) }]
    }
    return url.endsWith('gravity.json') ? {}
      : { data: { state: [{ id: 8, name: '地图' }, { id: 9, name: '空地图' }] } }
  })
  vi.mocked(fetchOptionalJson).mockImplementation(async (url) => {
    if (url.endsWith('country.json')) return countries
    if (url.endsWith('/9/position.json')) return [positions[0]]
    if (url.endsWith('/9/layer.json') || url.endsWith('/9/catalog.json')) return []
    if (url.endsWith('position.json')) return positions
    if (url.endsWith('layer.json')) return layers
    if (url.endsWith('catalog.json')) return catalog
    throw new Error(`未预期的请求：${url}`)
  })
  vi.mocked(fetchBytes).mockImplementation(async (url) => {
    if (url.includes('/mcmap/tiles/')) {
      const image = new PNG({ width: 1, height: 1 })
      image.data.fill(255)
      return PNG.sync.write(image)
    }
    if (url.endsWith('failed.png')) throw new Error('图标不可用')
    return iconBytes
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('map synchronization', () => {
  it('does not overwrite snapshots when floor coverage cannot be generated', async () => {
    vi.mocked(fetchBytes).mockRejectedValue(new Error('图片不可用'))
    await expect(syncMap(wiki)).rejects.toThrow('无法生成楼层覆盖范围')
    expect(writeJson).not.toHaveBeenCalled()
  })
  it('preserves gravity resources and point modes through synchronization', async () => {
    const originalFetchJson = vi.mocked(fetchJson).getMockImplementation()
    vi.mocked(fetchJson).mockImplementation(async (url, options) => {
      if (url.endsWith('catalogRelation.json')) return originalFetchJson?.(url, options)
      return url.endsWith('gravity.json') ? { '2': ['/2/0_1.png'] }
        : { data: { state: [{ id: 8, name: '地图' }] } }
    })
    const originalFetch = vi.mocked(fetchOptionalJson).getMockImplementation()
    vi.mocked(fetchOptionalJson).mockImplementation(async (url, fallback) => url.endsWith('position.json')
      ? positions.map((type) => ({ ...type, location: type.location.map((point) => ({ ...point, gravityType: 2 })) }))
      : originalFetch?.(url, fallback))
    const dataset = await syncMap(wiki)
    expect(dataset.states[0]?.gravityTiles).toEqual(['/2/0_1.png'])
    expect(dataset.echoLocations.find(({ id }) => id === 'echo-official')?.gravityType).toBe(2)
    expect(dataset.navigationPoints).toEqual([])
  })

  it('does not overwrite snapshots if the gravity manifest cannot be read', async () => {
    const originalFetchJson = vi.mocked(fetchJson).getMockImplementation()
    vi.mocked(fetchJson).mockImplementation(async (url, options) => {
      if (url.endsWith('gravity.json')) throw new Error('重力资源不可用')
      return originalFetchJson?.(url, options)
    })
    await expect(syncMap(wiki)).rejects.toThrow('重力资源不可用')
    expect(writeJson).not.toHaveBeenCalled()
  })
  it('preserves echoes and map metadata without publishing official navigation', async () => {
    const dataset = await syncMap()
    await expect(`${JSON.stringify(dataset, null, 2)}\n`).toMatchFileSnapshot('./fixtures/sync-map.json')
    const { map, catalog, locations } = splitMapDataset(dataset)
    expect(writeJson).toHaveBeenCalledWith('public/data/map-data.json', map, { compact: true })
    expect(writeJson).toHaveBeenCalledWith('public/data/catalog-data.json', catalog, { compact: true })
    expect(writeJson).toHaveBeenCalledWith('data/generated/official-locations.json', locations, { compact: true })
    expect(writeJson).toHaveBeenCalledWith('public/data/official-echo-points.json', { locations: locations.echoLocations, library: { version: 1, points: [] } }, { compact: true, skipUnchanged: true })
    expect(writeJson).not.toHaveBeenCalledWith('public/data/official-navigation-points.json', expect.anything(), expect.anything())
    expect(dataset.navigationPoints).toEqual([])
    expect(dataset.navigationPointGroups).toEqual([])
    expect(writeJson).toHaveBeenCalledWith('public/data/custom-echo-points.json', { version: 1, points: [] }, { compact: true, skipUnchanged: true })
    expect(writeJson).toHaveBeenCalledWith('public/data/custom-navigation-points.json', { version: 1, points: [] }, { compact: true, skipUnchanged: true })
    expect(writeJson).toHaveBeenCalledWith('data/generated/sync-report.json', dataset.report)
    expect(writePointLibrary).toHaveBeenCalledWith('data/generated/official-echo', expect.objectContaining({ version: 1 }), dataset, 'official')
    expect(vi.mocked(writePointLibrary).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(writeJson).mock.invocationCallOrder[0] ?? 0)
    expect(writeJson).toHaveBeenCalledWith('public/data/map-asset-catalog.json', expect.objectContaining({
      assets: expect.arrayContaining([expect.objectContaining({
        categories: expect.arrayContaining(['navigation']), name: expect.stringContaining('小型信标'),
      })]),
    }), { compact: true })
  })

  it('matches Chinese names and aliases to catalogue portraits without requiring map icons', async () => {
    const catalogue = { ...wiki, echoes: wiki.echoes.map((echo) => ({ ...echo, iconUrl: `https://example.test/wiki/${echo.id}.png` })) }
    const dataset = await syncMap(catalogue)
    expect(dataset.echoLocations.find(({ id }) => id === 'echo-official')).toMatchObject({ echoId: 'echo-0', iconUrl: 'https://example.test/wiki/echo-0.png' })
    expect(dataset.echoLocations.find(({ id }) => id === 'echo-alias')).toMatchObject({ echoId: 'echo-1', iconUrl: 'https://example.test/wiki/echo-1.png' })
    expect(dataset.echoes).toEqual(catalogue.echoes)
    expect(dataset.echoLocations.every((point) => point.iconUrl === catalogue.echoes.find(({ id }) => id === point.echoId)?.iconUrl)).toBe(true)
  })

  it('syncs map resources without importing Mengzhou or newly discovered map echoes', async () => {
    const originalJson = vi.mocked(fetchJson).getMockImplementation()
    const originalOptionalJson = vi.mocked(fetchOptionalJson).getMockImplementation()
    vi.mocked(fetchJson).mockImplementation(async (url, options) => {
      if (url.endsWith('getMapStateSelection')) {
        return { data: { state: [{ id: 8, name: '地图' }, { id: 912, name: '梦枢天罗' }, { id: 777, name: '新地图' }] } }
      }
      return originalJson?.(url, options)
    })
    vi.mocked(fetchOptionalJson).mockImplementation(async (url, fallback) => {
      if (url.endsWith('country.json')) return [{
        ...countries[0], mapStateId: '1,8', mapStateName: '今州,梦州',
        children: [
          ...countries[0]?.children ?? [],
          { name: '梦枢天罗', mapState: '8', stateId: 912, xPosition: 300, yPosition: 400 },
          { name: '新地图', mapState: '1', stateId: 777, xPosition: 300, yPosition: 400 },
        ],
      }]
      for (const stateId of [912, 777]) {
        if (url.endsWith(`/${stateId}/position.json`)) return [{
          id: 'new-echo-type', name: '甲', icon: 'echo.png',
          location: [{ id: `excluded-${stateId}`, stateId, countryId: 1, x: 100, y: 200 }],
        }]
        if (url.endsWith(`/${stateId}/layer.json`) || url.endsWith(`/${stateId}/catalog.json`)) return []
      }
      return originalOptionalJson?.(url, fallback)
    })
    const dataset = await syncMap(wiki)
    expect(dataset.states.map(({ id }) => id)).toEqual([8, 912, 777])
    expect(dataset.regionLabels.some(({ stateId }) => stateId === 912)).toBe(true)
    expect(dataset.echoLocations.every(({ stateId }) => stateId === 8)).toBe(true)
    expect(dataset.report.provisionalEchoLocationCount).toBe(1)
    expect(dataset.report.routeEligibleEchoLocationCount).toBe(3)
  })

  it('stops before writing when required resource discovery fails', async () => {
    vi.mocked(postFormJson).mockRejectedValueOnce(new Error('资源清单不可用'))
    await expect(syncMap(wiki)).rejects.toThrow('资源清单不可用')
    expect(writeJson).not.toHaveBeenCalled()
  })

  it('rejects an unknown independent manual echo before writing', async () => {
    vi.mocked(readJson).mockResolvedValueOnce({ ...manual, echoLocations: [{ ...manual.echoLocations[1], echoName: '未知' }] })
    await expect(syncMap(wiki)).rejects.toThrow('未知声骸')
    expect(writeJson).not.toHaveBeenCalled()
  })

})
