import type { RoutePoint } from '../../src/domain/types.ts'
import type { RoutePlanInput } from '../../src/route/optimizer.ts'

export function fragmentRouteInput(): RoutePlanInput {
  // Fixed synthetic geometry and input order exercise the large-route branch
  // independently of authored points and the published map's available beacons.
  let seed = 3
  function coordinate(): number {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % 10_000
  }
  function point(id: string, echoId: string | null): RoutePoint {
    const x = coordinate()
    const y = coordinate()
    return {
      id, name: id, echoId, stateId: 8, levelId: null,
      coordinate: { x, y, z: 0 }, mapCoordinate: [x, y],
    }
  }
  return {
    points: Array.from({ length: 320 }, (_, index) => point(`target-${index}`, `target-${index}`)),
    startPoints: Array.from({ length: 40 }, (_, index) => point(`start-${index}`, null)),
    connectors: [],
  }
}
