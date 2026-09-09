import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportRouteImages } from '../src/route/image-export.ts'
import { EXPORT_SIZE_ERROR } from '../src/route/full-export-layout.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'
import type { RouteExportSnapshot } from '../src/map/route-export.ts'
import type { ExportCard } from '../src/route/export-layout.ts'
import type { RoutePlanResult, RoutePoint } from '../src/domain/types.ts'

const renderer = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn() }))
vi.mock('../src/map/route-export.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/map/route-export.ts')>(),
  createRouteExportRenderer: () => renderer,
}))

let nativeLimit = 32767
let failure: 'none' | 'allocation' | 'finish' = 'none'
const canvases: TestCanvas[] = []
class TestCanvas {
  width = 0
  height = 0
  encodes = 0
  draws: { width: number; height: number; coordinates: number[] }[] = []
  texts: { text: string; x: number; y: number; maxWidth: number | undefined }[] = []
  context = {
    fillStyle: '', font: '', textAlign: '', textBaseline: '', fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    fillText: (text: string, x: number, y: number, maxWidth?: number) => { this.texts.push({ text, x, y, maxWidth }) },
    drawImage: (source: TestCanvas, ...coordinates: number[]) => { this.draws.push({ width: source.width, height: source.height, coordinates }) },
  }
  constructor() { canvases.push(this) }
  getContext() { return this.context }
  toBlob(callback: BlobCallback, type: string) {
    this.encodes += 1
    const failed = this.width > nativeLimit || this.height > nativeLimit
      || (this.width > 1 && this.height > 1 && failure === 'allocation')
      || (failure === 'finish' && this.encodes > 1)
    callback(failed ? null : new Blob([JSON.stringify({ width: this.width, height: this.height })], { type }))
  }
}
const points = Array.from({ length: 50 }, (_, index) => {
  const point: RoutePoint = { id: String(index), name: '声骸', echoId: null, stateId: 8, levelId: null, coordinate: { x: index * 1000, y: 0, z: 0 }, mapCoordinate: [index * 1000, 0] }
  return { ...point, teleportFrom: { ...point, id: `start-${index}`, mapCoordinate: [point.mapCoordinate[0], -600] satisfies [number, number] } }
})
const snapshot: RouteExportSnapshot = {
  route: { points, startPointId: null, totalCost: 0, algorithm: 'exact' }, dataset: await readMapDataset(),
  locations: [], navigationPoints: [], echoIds: [], gravity: 1, title: '尺寸测试', usesOfficial: true, createdAt: '2026-09-07',
}

beforeEach(() => {
  nativeLimit = 32767
  failure = 'none'
  canvases.length = 0
  renderer.dispose.mockClear()
  renderer.render.mockReset().mockImplementation(async (card: ExportCard) => {
    const canvas = new TestCanvas()
    canvas.width = card.width
    canvas.height = card.mapHeight
    return canvas
  })
  vi.stubGlobal('document', { createElement: () => new TestCanvas(), fonts: { ready: Promise.resolve() } })
})
afterEach(() => vi.unstubAllGlobals())

describe('full JPG export with browser size limits', () => {
  it('groups alternating points by navigation area and numbers each area continuously', async () => {
    const nearestLocations = (countryId: number, regionName: string) => {
      const region = snapshot.dataset.regionLabels.find((label) => label.countryId === countryId && label.stateId === 8 && label.name === regionName)
      if (!region) throw new Error(`测试地区缺失：${regionName}`)
      return snapshot.dataset.echoLocations.filter((location) => location.countryId === countryId && location.stateId === 8)
        .toSorted((left, right) => {
          const distance = (location: typeof left) => (location.coordinate.mapX - region.coordinate.mapX) ** 2 + (location.coordinate.mapY - region.coordinate.mapY) ** 2
          return distance(left) - distance(right)
        }).slice(0, 3)
    }
    const huanglong = nearestLocations(1, '今州城')
    const rinascita = nearestLocations(3, '拉古那城')
    if (huanglong.length < 3 || rinascita.length < 3) throw new Error('测试地区声骸点不足')
    const orderedLocations = huanglong.flatMap((location, index) => [location, rinascita[index]]).filter((location) => location !== undefined)
    const routePoints = orderedLocations.map((location) => {
      const point: RoutePoint = {
        id: location.id, name: location.typeName, echoId: 'echoId' in location ? location.echoId : null,
        stateId: location.stateId, levelId: location.levelId,
        coordinate: location.gameCoordinate ?? { x: 0, y: 0, z: 0 },
        mapCoordinate: [location.coordinate.mapX, location.coordinate.mapY],
      }
      return { ...point, teleportFrom: { ...point, id: `start:${point.id}` } }
    })
    const result = await exportRouteImages({
      ...snapshot,
      route: { points: routePoints, startPointId: null, totalCost: 0, algorithm: 'exact' },
      locations: orderedLocations,
    }, new AbortController().signal, () => undefined)

    expect(result.layout.banners.map(({ label }) => label)).toEqual(['瑝珑-今州', '黎那汐塔-拉古那'])
    expect(result.layout.cards.flatMap(({ targetIds }) => targetIds)).toEqual([...huanglong, ...rinascita].map(({ id }) => id))
    expect(result.layout.cards.map(({ number }) => number)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('publishes one independently packed image for each map', async () => {
    const firstSource = points[0]
    const secondSource = points[1]
    if (!firstSource || !secondSource) throw new Error('测试路线点缺失')
    const first = { ...firstSource, teleportFrom: undefined }
    const second = { ...secondSource, id: 'other-map', stateId: 903, teleportFrom: undefined }
    const routePlan: RoutePlanResult = {
      groups: [
        { id: '8:base:1', stateId: 8, levelId: null, gravityType: 1, label: '地表地图', mapName: '地表地图', echoCount: 1, matchingLocationCount: 1, incompleteLocationCount: 0, route: { points: [first], startPointId: null, totalCost: 0, algorithm: 'exact' } },
        { id: '903:base:2', stateId: 903, levelId: null, gravityType: 2, label: '阿维纽林 · 反重力', mapName: '阿维纽林', echoCount: 1, matchingLocationCount: 1, incompleteLocationCount: 0, route: { points: [second], startPointId: null, totalCost: 0, algorithm: 'exact' } },
      ],
      totalCost: 0,
      totalPoints: 2,
    }
    const result = await exportRouteImages({ ...snapshot, route: routePlan.groups[0]?.route ?? snapshot.route, routePlan }, new AbortController().signal, () => undefined)
    expect(result.maps.map(({ stateId, title }) => ({ stateId, title }))).toEqual([
      { stateId: 8, title: '地表地图' },
      { stateId: 903, title: '阿维纽林' },
    ])
    expect(renderer.render.mock.calls.map(([card]) => [card.stateId, card.gravityType])).toEqual([[8, 1], [903, 2]])
    const bannerCanvases = canvases.filter(({ texts }) => texts.length > 0)
    expect(bannerCanvases.length).toBeGreaterThanOrEqual(3)
    expect(bannerCanvases.flatMap(({ texts }) => texts.map(({ text }) => text))).toContain('地表地图')
    expect(bannerCanvases.flatMap(({ texts }) => texts.map(({ text }) => text))).toContain('阿维纽林 · 反重力')
    expect(result.layout.banners.map(({ label, x, width }) => ({ label, x, width }))).toEqual([
      { label: '地表地图', x: 0, width: result.layout.width },
      { label: '阿维纽林 · 反重力', x: 0, width: result.layout.width },
    ])
    const secondBanner = result.layout.banners[1]
    if (!secondBanner) throw new Error('第二个地区 banner 缺失')
    const firstGroupCards = result.layout.cards.filter(({ routeGroupId }) => routeGroupId === '8:base:1')
    const secondGroupCards = result.layout.cards.filter(({ routeGroupId }) => routeGroupId === '903:base:2')
    expect(Math.max(...firstGroupCards.map(({ y, height }) => y + height))).toBeLessThanOrEqual(secondBanner.y)
    expect(Math.min(...secondGroupCards.map(({ y }) => y))).toBeGreaterThanOrEqual(secondBanner.y + secondBanner.height)
  })

  it('draws a continuous two-column JPG separately from the mobile pages', async () => {
    nativeLimit = 65535
    const result = await exportRouteImages(snapshot, new AbortController().signal, () => undefined)
    if (!result.fullSize) throw new Error('完整长图应当生成')
    expect(result.fullColumns).toBe(2)
    expect(result.fullSize).toEqual({ width: 1600, height: 36260 })
    expect(result.fullSize.height).toBeLessThan(result.layout.height)
    const full = canvases.find(({ draws }) => draws.length === result.layout.cards.length)
    expect(full?.draws[4]?.coordinates).toEqual([10, 2910])
    expect(result.layout.cards[4]?.y).toBeGreaterThan(2910)
    expect(renderer.render).toHaveBeenCalledTimes(result.layout.cards.length)
  })

  it('detects the native limit and reflows the full image while keeping mobile pages at their original size', async () => {
    const result = await exportRouteImages(snapshot, new AbortController().signal, () => undefined)
    if (!result.fullSize || !result.full) throw new Error('完整长图应当生成')
    expect(result.fullSize.width).toBe(2395)
    expect(result.fullColumns).toBe(3)
    expect(result.fullSize.height).toBeLessThanOrEqual(nativeLimit)
    expect(JSON.parse(await result.full.text())).toEqual(result.fullSize)
    expect(result.pages).toHaveLength(result.layout.pages.length)
    expect(result.maps).toHaveLength(1)
    for (const [index, page] of result.pages.entries()) {
      expect(page.type).toBe('image/jpeg')
      expect(JSON.parse(await page.text())).toEqual({ width: 1600, height: result.layout.pageHeights[index] })
    }
    const full = canvases.find(({ draws }) => draws.length === result.layout.cards.length)
    expect(full?.draws.map(({ width, height }) => ({ width, height }))).toEqual(result.layout.cards.map(({ width, mapHeight }) => ({ width, height: mapHeight })))
    expect(full?.draws.every(({ coordinates }) => coordinates.length === 2)).toBe(true)
    expect(renderer.render).toHaveBeenCalledTimes(result.layout.cards.length)
    expect(renderer.dispose).toHaveBeenCalledOnce()
    expect(canvases.every(({ width, height }) => width === 0 && height === 0)).toBe(true)
  })

  it.each(['allocation', 'finish'] as const)('reports %s failure instead of returning only pages or shrinking the image', async (mode) => {
    failure = mode
    await expect(exportRouteImages(snapshot, new AbortController().signal, () => undefined)).rejects.toThrow(EXPORT_SIZE_ERROR)
    expect(canvases.every(({ width, height }) => width === 0 && height === 0)).toBe(true)
    if (mode === 'allocation') expect(renderer.render).not.toHaveBeenCalled()
    else expect(renderer.dispose).toHaveBeenCalledOnce()
  })
})
