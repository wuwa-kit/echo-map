import type { RoutePoint } from '../domain/types.ts'
import { gameToMapCoordinate } from '../map/projection.ts'

export const BOUNDARY_MAP_ID = 912

function axisPath(from: number, to: number, enabled: boolean) {
  let result = { distance: Math.abs(to - from), exit: from, arrival: from, before: 0, jump: false }
  if (!enabled) return result
  for (const sign of [-1, 1]) {
    const exit = sign * 705
    const arrival = -sign * 695
    const before = Math.abs(exit - from)
    const distance = before + Math.abs(to - arrival)
    if (distance < result.distance) result = { distance, exit, arrival, before, jump: true }
  }
  return result
}

function axes(from: RoutePoint, to: RoutePoint) {
  const enabled = from.stateId === BOUNDARY_MAP_ID && to.stateId === from.stateId
    && from.levelId === to.levelId
    && [from.coordinate.x, from.coordinate.y, to.coordinate.x, to.coordinate.y].every((value) => Math.abs(value) <= 705)
  return {
    x: axisPath(from.coordinate.x, to.coordinate.x, enabled),
    y: axisPath(from.coordinate.y, to.coordinate.y, enabled),
  }
}

export function walkingDistance(from: RoutePoint, to: RoutePoint): number {
  if (from.stateId !== BOUNDARY_MAP_ID) {
    return Math.hypot(to.coordinate.x - from.coordinate.x, to.coordinate.y - from.coordinate.y, to.coordinate.z - from.coordinate.z)
  }
  const { x, y } = axes(from, to)
  return Math.hypot(x.distance, y.distance, to.coordinate.z - from.coordinate.z)
}

// Each axis follows its shortest directed itinerary. Run those itineraries at
// constant absolute speed, splitting at jumps; this attains the 3D lower bound.
// Repeating an axis jump cannot improve it: a return jump costs at least 10,
// exactly the displacement it could save. Thresholds represent the crossing
// limit (the game's infinitesimal overshoot is not an extra measured distance).
export function walkingSegments(from: RoutePoint, to: RoutePoint, baseMapArrival = false): RoutePoint[][] {
  // Match bestStart's selected base-map fallback, while keeping the beacon's
  // authored floor identity. Ordinary cross-floor walking remains unchanged.
  const calculationFrom = baseMapArrival && from.levelId === null
    ? { ...from, levelId: to.levelId }
    : from
  const paths = axes(calculationFrom, to)
  const events = [...new Set([paths.x, paths.y].filter((path) => path.jump)
    .map((path) => path.distance === 0 ? 0 : path.before / path.distance))].sort((a, b) => a - b)
  if (!events.length) return [[from, to]]
  const segments: RoutePoint[][] = []
  let start = from
  function boundaryPoint(t: number, after: boolean, index: number): RoutePoint {
    function component(axis: 'x' | 'y'): number {
      const path = paths[axis]
      const source = from.coordinate[axis]
      const target = to.coordinate[axis]
      if (!path.jump) return source + (target - source) * t
      const split = path.distance === 0 ? 0 : path.before / path.distance
      if (t < split || (t === split && !after)) return source + Math.sign(path.exit - source) * path.distance * t
      return path.arrival + Math.sign(target - path.arrival) * (path.distance * t - path.before)
    }
    const coordinate = { x: component('x'), y: component('y'), z: from.coordinate.z + (to.coordinate.z - from.coordinate.z) * t }
    return {
      ...from, id: `boundary:${from.id}:${to.id}:${index}:${after ? 'in' : 'out'}`,
      name: `边界传送 ${index + 1}${after ? ' 出口' : ' 入口'}`, echoId: null, members: undefined,
      isTeleportArrival: undefined, coordinate, mapCoordinate: gameToMapCoordinate(coordinate.x, coordinate.y),
    }
  }
  for (const [index, t] of events.entries()) {
    segments.push([start, boundaryPoint(t, false, index)])
    start = boundaryPoint(t, true, index)
  }
  segments.push([start, to])
  return segments
}
