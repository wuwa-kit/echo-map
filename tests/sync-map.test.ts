import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncMap } from '../scripts/sync-map.ts'
import { fetchBytes, fetchJson, fetchOptionalJson, postFormJson } from '../scripts/lib/http.ts'
import { readJson, writeJson } from '../scripts/lib/files.ts'
import { groupNavigationPoints } from '../scripts/lib/map/navigation-groups.ts'
import { catalog, countries, iconBytes, iconHash, layers, manual, navigationConfig, positions, wiki } from './fixtures/sync-map-input.ts'

vi.mock('../scripts/lib/http.ts')
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
    if (path.endsWith('map-navigation-icon-groups.json')) return { namesByHash: { [iconHash]: '相同图标' } }
    throw new Error(`未预期的输入：${path}`)
  })
  vi.mocked(postFormJson).mockImplementation(async (url) => ({
    data: url.endsWith('getMapResource') ? 'test-resource-hash' : { '8': ['8_0_1'], '9': [] },
  }))
  vi.mocked(fetchJson).mockImplementation(async (url) => url.endsWith('gravity.json') ? {}
    : { data: { state: [{ id: 8, name: '地图' }, { id: 9, name: '空地图' }] } })
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
    if (url.endsWith('failed.png')) throw new Error('图标不可用')
    return iconBytes
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('map synchronization', () => {
  it('preserves gravity resources and point modes through synchronization', async () => {
    vi.mocked(fetchJson).mockImplementation(async (url) => url.endsWith('gravity.json') ? { '2': ['/2/0_1.png'] }
      : { data: { state: [{ id: 8, name: '地图' }] } })
    const originalFetch = vi.mocked(fetchOptionalJson).getMockImplementation()
    vi.mocked(fetchOptionalJson).mockImplementation(async (url, fallback) => url.endsWith('position.json')
      ? positions.map((type) => ({ ...type, location: type.location.map((point) => ({ ...point, gravityType: 2 })) }))
      : originalFetch?.(url, fallback))
    const dataset = await syncMap(wiki)
    expect(dataset.states[0]?.gravityTiles).toEqual(['/2/0_1.png'])
    expect(dataset.echoLocations.find(({ id }) => id === 'echo-official')?.gravityType).toBe(2)
    expect(dataset.navigationPoints.every(({ gravityType }) => gravityType === 2)).toBe(true)
  })

  it('does not overwrite snapshots if the gravity manifest cannot be read', async () => {
    vi.mocked(fetchJson).mockImplementation(async (url) => {
      if (url.endsWith('gravity.json')) throw new Error('重力资源不可用')
      return { data: { state: [{ id: 8, name: '地图' }] } }
    })
    await expect(syncMap(wiki)).rejects.toThrow('重力资源不可用')
    expect(writeJson).not.toHaveBeenCalled()
  })
  it('preserves the pre-refactor dataset, ordering, manual coordinates and failure report', async () => {
    const dataset = await syncMap()
    await expect(`${JSON.stringify(dataset, null, 2)}\n`).toMatchFileSnapshot('./fixtures/sync-map.json')
    expect(writeJson).toHaveBeenCalledWith('public/data/app-data.json', dataset)
    expect(writeJson).toHaveBeenCalledWith('data/generated/sync-report.json', dataset.report)
    expect(fetchBytes).not.toHaveBeenCalledWith(expect.stringContaining('boss.png'))
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

  it('rejects colliding shortened icon hashes instead of merging unrelated groups', async () => {
    const dataset = await syncMap(wiki)
    const points = dataset.navigationPoints.filter(({ typeId }) => typeId === '10' || typeId === '11')
    const hashes = new Map(points.map((point, index) => [point.iconUrl, 'a'.repeat(16) + String(index).repeat(48)]))
    expect(() => groupNavigationPoints(points, { namesByHash: {} }, hashes)).toThrow('定位点图标分组 ID 冲突')
  })

  it('handles an empty navigation catalogue without artificial groups', () => {
    expect(groupNavigationPoints([], { namesByHash: {} }, new Map())).toEqual({
      points: [], groups: [], iconFetchFailureCount: 0,
    })
  })
})
