import type { EchoLocation, MapDataset, NavigationPoint, PointLocationBase, RoutePoint } from '../domain/types.ts'
import type { RoutePlanInput } from './optimizer.ts'

export function createRoutePlanInput(
  dataset: MapDataset | null,
  locations: readonly EchoLocation[],
  startPoints: readonly NavigationPoint[],
  stateId: number,
  zWeight: number,
): RoutePlanInput {
  const names = new Map(dataset?.echoes.map(({ id, name }) => [id, name]))
  function toRoutePoint(location: PointLocationBase, echoId: string | null): RoutePoint {
    if (!location.gameCoordinate) {
      throw new Error(`点位 ${location.id} 缺少 XYZ`)
    }
    return {
      id: location.id,
      name: echoId === null ? location.typeName : names.get(echoId) ?? location.typeName,
      echoId,
      stateId: location.stateId,
      levelId: location.levelId,
      coordinate: location.gameCoordinate,
      mapCoordinate: [location.coordinate.mapX, location.coordinate.mapY],
    }
  }
  return {
    points: locations.map((location) => toRoutePoint(location, location.echoId)),
    startPoints: startPoints.map((location) => toRoutePoint(location, null)),
    connectors: (dataset?.connectors ?? []).filter((connector) => connector.stateId === stateId),
    zWeight,
  }
}
