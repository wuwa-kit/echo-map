import { describe, expect, it } from 'vitest'
import type { RoutePoint, RouteResult } from '../src/domain/types.ts'
import { walkingDistance, walkingSegments } from '../src/route/boundary-path.ts'
import { movementCost, optimizeRoute } from '../src/route/optimizer.ts'
import { createExportLayout } from '../src/route/export-layout.ts'
import { createRouteLayer } from '../src/map/route-layer.ts'
import { gameToMapCoordinate } from '../src/map/projection.ts'

function point(x: number, y = 0, z = 0): RoutePoint {
  return { id: `${x}:${y}:${z}`, name: '目标', echoId: null, stateId: 912, levelId: null,
    coordinate: { x, y, z }, mapCoordinate: gameToMapCoordinate(x, y) }
}

describe('梦枢天罗边界传送', () => {
  it('renders the base-map beacon fallback with the same boundary path used for its floor target', () => {
    const start = point(-671, -658, 8)
    const target = { ...point(-651, 653, -34), levelId: '-1/62' }
    const route = optimizeRoute({ points: [target], startPoints: [start], connectors: [] })
    expect(route.totalCost).toBeCloseTo(100.424100693)
    expect(route.points[0]?.teleportFrom?.levelId).toBeNull()
    expect(start.levelId).toBeNull()
    const layer = createRouteLayer()
    try {
      layer.update(route)
      const crossingX = -671 + 20 * 47 / 89
      expect(layer.hitTest(gameToMapCoordinate(crossingX, 0), 1, 1)).toMatchObject({ type: 'boundary', distance: 0 })
      // The former straight beacon-to-target line must no longer be hit.
      expect(layer.hitTest(gameToMapCoordinate(-661, -2.5), 0.1, 1)).toBeNull()
      const layout = createExportLayout(route)
      expect(layout.sections).toBe(1)
      expect(layout.cards).toHaveLength(1)
      expect(layout.cards[0]?.panels).toHaveLength(2)
      expect(layout.cards[0]?.panels?.[0]?.nodes.at(-1)?.point.coordinate.y).toBe(-705)
      expect(layout.cards[0]?.panels?.[1]?.nodes[0]?.point.coordinate.y).toBe(695)
    } finally {
      layer.dispose()
    }
  })

  it.each(['x', 'y'] as const)('uses directed %s crossings and allows walking back after arrival', (axis) => {
    const at = (value: number) => axis === 'x' ? point(value) : point(0, value)
    expect(walkingDistance(at(690), at(-700))).toBe(20)
    expect(walkingDistance(at(-700), at(690))).toBe(10)
    expect(walkingDistance(at(-695), at(695))).toBe(10)
    expect(walkingDistance(at(695), at(-695))).toBe(10)
    expect(walkingDistance(at(705), at(-695))).toBe(0)
    expect(walkingSegments(at(705), at(-695)).flat().every(({ coordinate }) => Number.isFinite(coordinate[axis]))).toBe(true)
  })

  it('keeps direct travel, other maps and floors unchanged', () => {
    expect(walkingDistance(point(0), point(10, 0, 10))).toBeCloseTo(Math.hypot(10, 10))
    expect(walkingDistance({ ...point(690), stateId: 8 }, { ...point(-700), stateId: 8 })).toBe(1390)
    expect(movementCost(point(690), { ...point(-700), levelId: 'other' }, { connectors: [] })).toBe(Infinity)
    expect(walkingSegments(point(0), point(10))).toHaveLength(1)
  })

  it('preserves height and the other axis at successive crossings', () => {
    const from = point(690, 680, 12)
    const to = point(-700, -690, 42)
    const segments = walkingSegments(from, to)
    expect(segments).toHaveLength(3)
    expect(walkingDistance(from, to)).toBeCloseTo(Math.hypot(20, 30, 30))
    let walked = 0
    for (const [index, segment] of segments.entries()) {
      const a = segment[0]
      const b = segment[1]
      if (!a || !b) throw new Error('Missing walking endpoints')
      walked += Math.hypot(b.coordinate.x - a.coordinate.x, b.coordinate.y - a.coordinate.y, b.coordinate.z - a.coordinate.z)
      const arrival = segments[index + 1]?.[0]
      if (arrival) {
        expect(arrival.coordinate.z).toBe(b.coordinate.z)
        const deltas = ['x', 'y'].map((axis) => axis === 'x' ? Math.abs(arrival.coordinate.x - b.coordinate.x) : Math.abs(arrival.coordinate.y - b.coordinate.y))
        expect(deltas.sort((a, b) => a - b)).toEqual([0, 1400])
      }
    }
    expect(walked).toBeCloseTo(walkingDistance(from, to))
  })

  it('handles simultaneous corner crossings', () => {
    const segments = walkingSegments(point(690, 690), point(-690, -690))
    expect(segments).toHaveLength(2)
    expect(segments[0]?.[1]?.coordinate).toEqual({ x: 705, y: 705, z: 0 })
    expect(segments[1]?.[0]?.coordinate).toEqual({ x: -695, y: -695, z: 0 })
  })

  it('combines successive jumps into one numbered card with equally scaled local maps', () => {
    const route: RouteResult = { points: [point(690, 680, 12), point(-700, -690, 42)], totalCost: 0, startPointId: null, algorithm: 'exact' }
    const layout = createExportLayout(route)
    expect(layout.cards).toHaveLength(1)
    const card = layout.cards[0]
    const panels = card?.panels ?? []
    expect(panels).toHaveLength(3)
    expect(new Set(panels.map(({ resolution }) => resolution)).size).toBe(1)
    expect(panels.map(({ number }) => number)).toEqual([1, 1, 1])
    expect(card?.targetIds).toEqual(route.points.map(({ id }) => id))
    for (const [index, panel] of panels.entries()) {
      expect(panel.y + panel.height).toBeLessThanOrEqual(card?.height ?? 0)
      expect(panel.width).toBe(card?.width)
      const previous = panels[index - 1]
      if (previous) expect(panel.y).toBeGreaterThan(previous.y + previous.height)
    }
  })

  it('keeps a new beacon route separate and numbers subsequent cards consecutively', () => {
    const route: RouteResult = {
      points: [point(690), point(-700), { ...point(0), teleportFrom: point(20) }],
      totalCost: 0, startPointId: null, algorithm: 'exact',
    }
    const layout = createExportLayout(route)
    expect(layout.sections).toBe(2)
    expect(layout.cards.map(({ number, section }) => [number, section])).toEqual([[1, 1], [2, 2]])
    expect(layout.cards[0]?.panels).toHaveLength(2)
    expect(layout.cards[1]?.panels).toBeUndefined()
  })

  it('splits oversized sequences while preserving every target and bounded panels', () => {
    const targets = Array.from({ length: 30 }, (_, index) => point(index % 2 ? -690 : 690, index))
    const layout = createExportLayout({ points: targets, totalCost: 0, startPointId: null, algorithm: 'exact' })
    expect(layout.sections).toBe(1)
    expect(layout.cards.length).toBeGreaterThan(1)
    expect(layout.cards.flatMap(({ targetIds }) => targetIds)).toEqual(targets.map(({ id }) => id))
    expect(layout.cards.map(({ number }) => number)).toEqual(layout.cards.map((_, index) => index + 1))
    for (const card of layout.cards) {
      expect(card.parts).toBe(layout.cards.length)
      expect(card.height).toBeLessThanOrEqual(3040)
      expect(card.targetIds.length).toBeLessThanOrEqual(12)
      for (const panel of card.panels ?? []) {
        expect(panel.width).toBe(card.width)
        expect(panel.y + panel.height).toBeLessThanOrEqual(card.height)
      }
    }
  })

  it('chooses the short directed route and compares beacon approaches', () => {
    const route = optimizeRoute({ points: [point(690), point(-700)], startPoints: [], connectors: [] })
    expect(route.points.map(({ coordinate }) => coordinate.x)).toEqual([-700, 690])
    expect(route.totalCost).toBe(10)
    const withStart = optimizeRoute({ points: [point(-700)], startPoints: [point(690), point(-650)], connectors: [] })
    expect(withStart.totalCost).toBe(20)
    expect(withStart.startPointId).toBe(point(690).id)
  })

  it('uses boundary distances for the large-route nearest-neighbor seed', () => {
    const route = optimizeRoute({ points: [point(700), point(-690), ...Array.from({ length: 255 }, (_, i) => point(600 - i))], startPoints: [], connectors: [] })
    expect(route.points).toHaveLength(257)
    expect(new Set(route.points.map(({ id }) => id)).size).toBe(257)
    expect(route.totalCost).toBeLessThan(400)
  })

  it('splits rendering, hit testing and exports at the boundary', () => {
    const route: RouteResult = { points: [point(690), point(-700)], totalCost: 20, startPointId: null, algorithm: 'exact' }
    const layer = createRouteLayer()
    try {
      layer.update(route)
      expect(layer.hitTest(gameToMapCoordinate(0, 0), 1, 1)).toMatchObject({ type: 'boundary', distance: 0 })
      expect(layer.hitTest(gameToMapCoordinate(700, 0), 1, 1)?.distance).toBe(15)
      expect(layer.hitTest(gameToMapCoordinate(-697, 0), 1, 1)?.distance).toBe(5)
      const layout = createExportLayout(route)
      expect(layout.sections).toBe(1)
      expect(layout.cards).toHaveLength(1)
      expect(layout.cards.flatMap(({ targetIds }) => targetIds)).toEqual(route.points.map(({ id }) => id))
      expect(layout.cards[0]?.panels?.[0]?.nodes.at(-1)?.point.coordinate.x).toBe(705)
      expect(layout.cards[0]?.panels?.[1]?.nodes[0]?.point.coordinate.x).toBe(-695)
      expect(layout.cards.every(({ nodes }) => nodes.every(({ point }) => Math.abs(point.coordinate.x) >= 690))).toBe(true)
      for (const card of layout.cards.flatMap((card) => card.panels ?? [card])) {
        layer.update({ ...route, points: card.nodes.map(({ point }) => point) })
        expect(layer.hitTest(gameToMapCoordinate(0, 0), 1, 1)).toBeNull()
      }
    } finally {
      layer.dispose()
    }
  })
})
