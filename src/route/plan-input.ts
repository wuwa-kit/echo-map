import type { EchoMapLocation, MapDataset, NavigationPoint, PointLocationBase, RoutePoint } from '../domain/types.ts'
import type { RoutePlanInput } from './optimizer.ts'

export function createRoutePlanInput(
  dataset: MapDataset | null,
  locations: readonly EchoMapLocation[],
  startPoints: readonly NavigationPoint[],
  stateId: number,
  zWeight: number,
  activeEchoIds?: ReadonlySet<string>,
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
    points: locations.flatMap((location) => {
      if (!('members' in location)) return [toRoutePoint(location, location.echoId)]
      const members = location.members.filter(({ echoId }) => !activeEchoIds || activeEchoIds.has(echoId)).map((member) => ({ ...member, name: names.get(member.echoId) ?? member.echoId }))
      if (members.length === 0) return []
      return [{ ...toRoutePoint(location, null), name: members.map(({ name, count }) => `${name} ×${count}`).join(' · '), members }]
    }),
    startPoints: startPoints.map((location) => toRoutePoint(location, null)),
    connectors: (dataset?.connectors ?? []).filter((connector) => connector.stateId === stateId),
    zWeight,
  }
}
