import { describe, expect, it } from 'vitest'
import { createExportLayout, EXPORT_MARGIN } from '../src/route/export-layout.ts'
import type { RoutePlanResult, RoutePoint, RouteResult } from '../src/domain/types.ts'

function point(id: string, x: number, y = 0, levelId: string | null = null): RoutePoint {
  return { id, name: id, echoId: null, stateId: 8, levelId, coordinate: { x, y, z: 0 }, mapCoordinate: [x, y] }
}
function route(points: RouteResult['points']): RouteResult { return { points, startPointId: null, totalCost: 0, algorithm: 'exact' } }

describe('route image layout', () => {
  it('keeps independently planned maps in labeled export groups', () => {
    const first = route([point('surface', 0)])
    const second = route([{ ...point('icefield', 100), stateId: 903 }])
    const plan: RoutePlanResult = {
      groups: [
        { id: '8:base:1', stateId: 8, levelId: null, gravityType: 1, label: '地表地图', mapName: '地表地图', echoCount: 1, matchingLocationCount: 1, incompleteLocationCount: 0, route: first },
        { id: '903:base:2', stateId: 903, levelId: null, gravityType: 2, label: '阿维纽林 · 反重力', mapName: '阿维纽林', echoCount: 1, matchingLocationCount: 1, incompleteLocationCount: 0, route: second },
      ],
      totalCost: 0,
      totalPoints: 2,
    }
    const layout = createExportLayout(plan)
    expect(layout.sections).toBe(2)
    expect(layout.cards.map(({ routeGroupId, groupLabel, gravityType }) => ({ routeGroupId, groupLabel, gravityType }))).toEqual([
      { routeGroupId: '8:base:1', groupLabel: '地表地图', gravityType: 1 },
      { routeGroupId: '903:base:2', groupLabel: '阿维纽林 · 反重力', gravityType: 2 },
    ])
  })

  it.each([[1e9, 0], [0, 1e9]])('rejects oversized routes to %s, %s before expanding their intermediate nodes', (x, y) => {
    let reads = 0
    const destination: RoutePoint = {
      ...point('distant', x, y),
      get mapCoordinate(): [number, number] {
        if (++reads > 100) throw new Error('Unbounded route expansion')
        return [x, y]
      },
    }
    expect(() => createExportLayout(route([point('start', 0), destination]))).toThrow('图片尺寸过大，生成失败')
  })

  it('rejects cumulative crop capacity before building an unbounded layout', () => {
    const points = Array.from({ length: 20000 }, (_, index) => point(String(index), 0))
    expect(() => createExportLayout(route(points))).toThrow('图片尺寸过大，生成失败')
  })

  it('fits compact continuation cards independently of their wide section', () => {
    const points = [point('start', 0), ...Array.from({ length: 24 }, (_, index) => point(`echo-${index}`, 600 + index % 12 * 9, Math.floor(index / 12) * 40 + index % 3 * 5))]
    const layout = createExportLayout(route(points))
    const first = layout.cards[0]
    const continuation = layout.cards[1]
    if (!first || !continuation) throw new Error('Missing continuation crop')
    expect(first.width).toBe(1580)
    expect(continuation.width).toBe(785)
    expect(continuation.resolution).toBeLessThan(first.resolution)
    const xs = continuation.nodes.map(({ point }) => point.mapCoordinate[0])
    const occupiedWidth = (Math.max(...xs) - Math.min(...xs)) / continuation.resolution
    expect(occupiedWidth / continuation.mapSize[0]).toBeGreaterThan(0.6)
    expect(layout.cards.flatMap(({ targetIds }) => targetIds)).toEqual(points.map(({ id }) => id))
  })

  it('uses teleports and floor transitions as section boundaries', () => {
    const layout = createExportLayout(route([
      { ...point('a', 0), teleportFrom: point('beacon', -20) }, point('b', 50),
      { ...point('c', 1000), teleportFrom: point('other', 990) },
      point('d', 1010, 0, 'upper'),
    ]))
    expect(layout.sections).toBe(3)
    expect(layout.cards.map(({ targetIds }) => targetIds)).toEqual([['a', 'b'], ['c'], ['d']])
    expect(layout.cards[2]?.floorTransition).toBe(true)
    expect(layout.cards[1]?.nodes[0]?.point.id).toBe('other')
  })

  it.each([[6000, 0], [0, 6000], [-6000, -6000]])('covers an entire long edge to %s, %s with overlapping continuous crops', (x, y) => {
    const source = route([point('a', 0), point('b', x, y)])
    const before = structuredClone(source)
    const layout = createExportLayout(source)
    expect(source).toEqual(before)
    expect(layout.cards.length).toBeGreaterThan(2)
    expect(layout.pages.flatMap(({ cards }) => cards.map(({ number }) => number))).toEqual(layout.cards.map((_, index) => index + 1))
    expect(layout.cards.flatMap(({ targetIds }) => targetIds)).toEqual(['a', 'b'])
    expect(layout.cards.every(({ resolution }) => resolution >= 0.75 && resolution <= 3)).toBe(true)
    const intervals = layout.cards.map(({ nodes }) => {
      const values = nodes.map(({ point: { mapCoordinate } }) => x !== 0 ? mapCoordinate[0] / x : mapCoordinate[1] / y)
      return [Math.min(...values), Math.max(...values)]
    })
    expect(intervals[0]?.[0]).toBeCloseTo(0)
    expect(intervals.at(-1)?.[1]).toBe(1)
    for (let index = 1; index < intervals.length; index += 1) expect(intervals[index]?.[0]).toBeLessThan(intervals[index - 1]?.[1] ?? 0)
    for (const card of layout.cards) {
      expect(card.mapHeight).toBeLessThanOrEqual(1440)
      for (const node of card.nodes) {
        expect(Math.abs(node.point.mapCoordinate[0] - card.center[0]) / card.resolution).toBeLessThan(card.mapSize[0] / 2 - 20)
        expect(Math.abs(node.point.mapCoordinate[1] - card.center[1]) / card.resolution).toBeLessThan(card.mapSize[1] / 2 - 20)
      }
    }
  })

  it('retains each target once in order and packs at most two cards without cutting cards between pages', () => {
    const points = Array.from({ length: 55 }, (_, index) => point(`target-${index}`, index % 6 * 30, Math.floor(index / 6) * 50))
    const layout = createExportLayout(route(points))
    expect(layout.cards.flatMap(({ targetIds }) => targetIds)).toEqual(points.map(({ id }) => id))
    expect(layout.cards.every(({ targetIds }) => targetIds.length <= 12)).toBe(true)
    expect(new Set(layout.cards.map(({ x }) => x)).size).toBe(2)
    for (const card of layout.cards) {
      expect(layout.cards.filter((other) => other !== card && other.x < card.x + card.width && other.x + other.width > card.x
        && other.y < card.y + card.height && other.y + other.height > card.y)).toHaveLength(0)
    }
    expect(layout.pageHeights.every((height) => height <= 3200)).toBe(true)
    expect(layout.pageHeights.reduce((a, b) => a + b, 0)).toBe(layout.height)
    let boundary = 0
    for (const height of layout.pageHeights.slice(0, -1)) {
      boundary += height
      expect(layout.cards.every(({ y, height }) => y >= boundary || y + height <= boundary)).toBe(true)
    }
  })

  it('keeps dense and wide route splitting with integer output rectangles at the reduced density', () => {
    const dense = createExportLayout(route(Array.from({ length: 55 }, (_, index) => point(`target-${index}`, index % 6 * 30, Math.floor(index / 6) * 50))))
    expect(dense.width).toBe(1600)
    expect(dense.cards).toHaveLength(5)
    expect(dense.cards.every(({ width, mapSize }) => width === 785 && mapSize[0] === 197)).toBe(true)
    const wide = createExportLayout(route([point('a', 0), point('b', 6000)]))
    expect(wide.cards).toHaveLength(9)
    expect(wide.cards.every(({ mapSize }) => mapSize[0] === 396 && mapSize[1] === 72)).toBe(true)
    expect(wide.height).toBe(2688)
    for (const layout of [dense, wide]) {
      for (const page of layout.pages) {
        expect([page.y, page.height].every(Number.isInteger)).toBe(true)
        for (const card of page.cards) {
          expect([card.x, card.y, card.width, card.height].every(Number.isInteger)).toBe(true)
          expect(card.x + card.width).toBeLessThanOrEqual(layout.width)
          expect(card.y).toBeGreaterThanOrEqual(page.y)
          expect(card.y + card.height).toBeLessThanOrEqual(page.y + page.height)
        }
      }
    }
  })

  it('renders one target and rejects an empty route', () => {
    const single = createExportLayout(route([point('only', 0)]))
    expect(single.cards[0]?.targetIds).toEqual(['only'])
    expect(single.cards[0]?.width).toBe(single.width - EXPORT_MARGIN * 2)
    expect(() => createExportLayout(route([]))).toThrow('请先生成路线')
  })

  it('removes text bands and fills the shorter column without waiting for its tall neighbour', () => {
    const layout = createExportLayout(route([
      { ...point('a', 0), teleportFrom: point('start-a', -10, -180) },
      { ...point('b', 1000), teleportFrom: point('start-b', 990, -30) },
      { ...point('c', 2000), teleportFrom: point('start-c', 1990, -40) },
      { ...point('d', 3000), teleportFrom: point('start-d', 2990, -30) },
    ]))
    const [first, second, third] = layout.cards
    expect(first?.height).toBe(first?.mapHeight)
    expect(first?.y).toBeLessThan(24)
    expect(third?.x).toBe(second?.x)
    expect(third?.y).toBeLessThan((first?.y ?? 0) + (first?.height ?? 0))
  })

  it('uses the destination floor when its teleport start belongs to the surface', () => {
    const layout = createExportLayout(route([{ ...point('underground', 100, 100, 'cave'), teleportFrom: point('surface', 0) }]))
    expect(layout.cards[0]?.levelId).toBe('cave')
    expect(layout.cards[0]?.nodes[0]?.point.levelId).toBeNull()
  })
})
