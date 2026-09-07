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

  it.each([2, 16])('reconsiders fast travel at every stop for %i targets', (count) => {
    const half = count / 2
    const points = Array.from({ length: count }, (_, index) => point(`target-${index}`, index < half ? index + 1 : 100 + index - half + 1, 0, 0))
    const result = optimizeRoute({
      points,
      startPoints: [point('west', 0, 0, 0), point('east', 100, 0, 0)],
      connectors: [],
      zWeight: 1,
    })

    expect(result.totalCost).toBe(count)
    expect(new Set(result.points.map(({ id }) => id))).toEqual(new Set(points.map(({ id }) => id)))
    expect(result.points).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'target-0', teleportFrom: expect.objectContaining({ id: 'west' }) }),
      expect.objectContaining({ id: `target-${half}`, teleportFrom: expect.objectContaining({ id: 'east' }) }),
    ]))
  })

  it.each([2, 16])('can teleport between disconnected floors with %i targets and an eligible beacon on each floor', (count) => {
    const points = Array.from({ length: count }, (_, index) => index < count / 2
      ? point(`upper-${index}`, index + 1, 0, 10, 'upper')
      : point(`lower-${index}`, index - count / 2 + 1, 0, -10, 'lower'))
    const result = optimizeRoute({
      points,
      startPoints: [point('upper-beacon', 0, 0, 10, 'upper'), point('lower-beacon', 0, 0, -10, 'lower')],
      connectors: [],
      zWeight: 1,
    })

    expect(result.totalCost).toBe(count)
    expect(new Set(result.points.map(({ id }) => id))).toEqual(new Set(points.map(({ id }) => id)))
    expect(result.points.filter(({ teleportFrom }) => teleportFrom)).toHaveLength(2)
  })

  it.each([2, 16])('keeps walking costs for %i targets when no fast travel points are available', (count) => {
    const result = optimizeRoute({
      points: Array.from({ length: count }, (_, index) => point(`target-${index}`, index * 10, 0, 0)),
      startPoints: [],
      connectors: [],
      zWeight: 1,
    })

    expect(result.totalCost).toBe((count - 1) * 10)
    expect(result.startPointId).toBeNull()
  })

  it('uses XYZ cost instead of map proximity when choosing each teleport', () => {
    const upper = point('upper', 0, 0, 100)
    const lower = point('lower', 0, 0, 0)
    const result = optimizeRoute({
      points: [upper, lower],
      startPoints: [point('upper-beacon', 3, 4, 100), point('lower-beacon', 3, 4, 0)],
      connectors: [],
      zWeight: 2,
    })

    expect(result.totalCost).toBe(10)
    expect(result.points.find(({ id }) => id === 'upper')?.teleportFrom?.id).toBe('upper-beacon')
    expect(result.points.find(({ id }) => id === 'lower')?.teleportFrom?.id).toBe('lower-beacon')
  })

  it('keeps walking when it ties with teleporting', () => {
    const result = optimizeRoute({
      points: [point('first', 1, 0, 0), point('second', 2, 0, 0)],
      startPoints: [point('beacon', 0, 0, 0), point('tied-beacon', 3, 0, 0)],
      connectors: [],
      zWeight: 1,
    })

    expect(result.totalCost).toBe(2)
    expect(result.points[0]?.teleportFrom).toBeDefined()
    expect(result.points[1]?.teleportFrom).toBeUndefined()
  })

  it('finds the minimum directed travel cost among all small-route permutations', () => {
    const input = {
      points: [point('a', 5, 3, 0), point('b', 45, 10, 8), point('c', 41, 8, 0), point('d', 20, 40, 0)],
      startPoints: [point('west', 0, 0, 0), point('east', 40, 0, 0)],
      connectors: [],
      zWeight: 2,
    }
    function minimumCost(remaining: RoutePoint[], previous?: RoutePoint): number {
      if (remaining.length === 0) return 0
      return Math.min(...remaining.map((next) => {
        const cost = Math.min(
          previous ? movementCost(previous, next, input) : Number.POSITIVE_INFINITY,
          ...input.startPoints.map((start) => movementCost(start, next, input)),
        )
        return cost + minimumCost(remaining.filter((point) => point !== next), next)
      }))
    }

    expect(optimizeRoute(input).totalCost).toBeCloseTo(minimumCost(input.points), 8)
  })
})
