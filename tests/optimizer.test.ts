import { describe, expect, it } from 'vitest'
import { movementCost, optimizeRoute } from '../src/route/optimizer.ts'
import type { RoutePoint } from '../src/domain/types.ts'

function point(id: string, x: number, y: number, z: number, levelId: string | null = null): RoutePoint {
  return {
    id,
    name: id,
    echoId: id,
    stateId: 8,
    levelId,
    coordinate: { x, y, z },
    mapCoordinate: [x, y],
  }
}

describe('route optimizer', () => {
  it('finds the exact open route for a small point set', () => {
    const result = optimizeRoute({
      points: [point('far', 10, 0, 0), point('near', 2, 0, 0), point('middle', 5, 0, 0)],
      startPoints: [point('teleport', 0, 0, 0)],
      connectors: [],
      zWeight: 1,
    })
    expect(result.algorithm).toBe('exact')
    expect(result.startPointId).toBe('teleport')
    expect(result.points.map(({ id }) => id)).toEqual(['near', 'middle', 'far'])
    expect(result.totalCost).toBe(10)
  })

  it('uses z in movement cost', () => {
    const flat = movementCost(point('a', 0, 0, 0), point('b', 3, 4, 0), { connectors: [], zWeight: 2 })
    const vertical = movementCost(point('a', 0, 0, 0), point('b', 3, 4, 6), { connectors: [], zWeight: 2 })
    expect(flat).toBe(5)
    expect(vertical).toBe(13)
  })

  it('rejects cross-floor travel without a connector and accepts an explicit connector', () => {
    const upper = point('upper', 0, 0, 10, 'upper')
    const lower = point('lower', 5, 0, -10, 'lower')
    expect(movementCost(upper, lower, { connectors: [], zWeight: 1 })).toBe(Number.POSITIVE_INFINITY)
    expect(movementCost(upper, lower, {
      zWeight: 1,
      connectors: [{
        id: 'lift',
        name: '升降梯',
        stateId: 8,
        fromLevelId: 'upper',
        toLevelId: 'lower',
        from: { x: 0, y: 0, z: 10 },
        to: { x: 0, y: 0, z: -10 },
        traversalCost: 3,
        isExample: true,
      }],
    })).toBe(8)
  })

  it('considers every eligible start point for heuristic routes', () => {
    const points = Array.from({ length: 16 }, (_, index) => point(`target-${index}`, index, 0, 0))
    const startPoints = [
      ...Array.from({ length: 32 }, (_, index) => point(`far-${index}`, 1_000 + index, 0, 0)),
      point('nearest', -1, 0, 0),
    ]
    const result = optimizeRoute({ points, startPoints, connectors: [], zWeight: 1 })

    expect(result.algorithm).toBe('nearest-neighbor-2opt')
    expect(result.startPointId).toBe('nearest')
    expect(result.totalCost).toBe(16)
  })
})
