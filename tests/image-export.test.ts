import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportRouteImages } from '../src/route/image-export.ts'
import { EXPORT_SIZE_ERROR } from '../src/route/full-export-layout.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'
import type { RouteExportSnapshot } from '../src/map/route-export.ts'
import type { ExportCard } from '../src/route/export-layout.ts'
import type { RoutePoint } from '../src/domain/types.ts'

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
  context = {
    fillStyle: '', fillRect: vi.fn(),
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
  it('draws a continuous two-column JPG separately from the mobile pages', async () => {
    nativeLimit = 65535
    const result = await exportRouteImages(snapshot, new AbortController().signal, () => undefined)
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
    expect(result.fullSize.width).toBe(2395)
    expect(result.fullColumns).toBe(3)
    expect(result.fullSize.height).toBeLessThanOrEqual(nativeLimit)
    expect(JSON.parse(await result.full.text())).toEqual(result.fullSize)
    expect(result.pages).toHaveLength(result.layout.pages.length)
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
