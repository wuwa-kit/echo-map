import { describe, expect, it } from 'vitest'
import type { RoutePoint, RouteResult } from '../src/domain/types.ts'
import { optimizeRoute } from '../src/route/optimizer.ts'
import { fragmentRouteInput } from './fixtures/optimizer-fragments.ts'

function distance(left: RoutePoint, right: RoutePoint): number {
  return Math.hypot(
    left.coordinate.x - right.coordinate.x,
    left.coordinate.y - right.coordinate.y,
    left.coordinate.z - right.coordinate.z,
  )
}

function routeCost(points: readonly RoutePoint[], teleportCosts: ReadonlyMap<string, number>): number {
  return points.reduce((total, point, index) => {
    const previous = points[index - 1]
    return total + Math.min(
      previous ? distance(previous, point) : Infinity,
      teleportCosts.get(point.id) ?? Infinity,
    )
  }, 0)
}

function walkingSegments(points: RouteResult['points']): RouteResult['points'][] {
  const segments: RouteResult['points'][] = []
  let current: RouteResult['points'] = []
  for (const point of points) {
    if (point.teleportFrom && current.length > 0) {
      segments.push(current)
      current = []
    }
    current.push(point)
  }
  if (current.length > 0) segments.push(current)
  return segments
}

describe('route fragment regression', () => {
  it('joins walking fragments when their endpoints are cheaper to connect than teleporting again', () => {
    const input = fragmentRouteInput()
    const result = optimizeRoute(input)
    expect(result.points).toHaveLength(input.points.length)
    expect(new Set(result.points.map(({ id }) => id))).toEqual(new Set(input.points.map(({ id }) => id)))

    const segments = walkingSegments(result.points)
    expect(segments.length).toBeGreaterThan(1)
    for (const from of segments) {
      for (const to of segments) {
        if (from === to) continue
        const end = from.at(-1)
        const start = to[0]
        if (!end || !start?.teleportFrom) throw new Error('测试路线缺少步行分段或传送起点')
        expect(distance(end, start) + 1e-6).toBeGreaterThanOrEqual(distance(start.teleportFrom, start))
      }
    }
  })

  // Without global relocation these targets remain isolated, although inserting
  // them elsewhere saves travel. Check cost rather than one exact neighbor/order.
  it.each(['target-17', 'target-63'])('places isolated %s where reinserting it cannot shorten the route', (id) => {
    const input = fragmentRouteInput()
    const result = optimizeRoute(input)
    const isolated = result.points.find((point) => point.id === id)
    if (!isolated) throw new Error(`测试路线缺少点位 ${id}`)
    const remaining = result.points.filter((point) => point.id !== id)
    const teleportCosts = new Map(input.points.map((point) => [
      point.id, Math.min(...input.startPoints.map((start) => distance(start, point))),
    ]))
    expect(routeCost(result.points, teleportCosts)).toBeCloseTo(result.totalCost, 6)
    for (let gap = 0; gap <= remaining.length; gap += 1) {
      const candidate = [...remaining.slice(0, gap), isolated, ...remaining.slice(gap)]
      expect(routeCost(candidate, teleportCosts) + 1e-6).toBeGreaterThanOrEqual(result.totalCost)
    }
  })
})
