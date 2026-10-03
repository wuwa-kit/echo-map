import { pointRegionResolver } from '../domain/point-region.ts'
import type { GravityType, MapDataset, RoutePlanGroup, RoutePlanResult, RouteResult } from '../domain/types.ts'

type RegionDataset = Pick<MapDataset, 'mapNavigation' | 'regionLabels' | 'states'>

function sourceGroups(
  routeSource: RouteResult | RoutePlanResult,
  dataset: RegionDataset,
  gravityType: GravityType,
): RoutePlanGroup[] {
  if ('groups' in routeSource) return routeSource.groups
  const stateId = routeSource.points[0]?.stateId ?? 0
  const levelId = routeSource.points[0]?.levelId ?? null
  return [{
    id: `current:${stateId}:${levelId ?? 'base'}:${gravityType}`,
    stateId, levelId, gravityType,
    label: '', mapName: dataset.states.find(({ id }) => id === stateId)?.name ?? `地图 ${stateId}`,
    echoCount: 0, matchingLocationCount: routeSource.points.length, incompleteLocationCount: 0,
    route: routeSource,
  }]
}

export function createRegionalExportPlan(
  routeSource: RouteResult | RoutePlanResult,
  dataset: RegionDataset,
  sourcePointIds: ReadonlySet<string>,
  gravityType: GravityType,
): RoutePlanResult {
  const resolveRegion = pointRegionResolver(dataset)
  const areas = new Map<string, { label: string; groups: Map<string, { source: RoutePlanGroup; points: RouteResult['points'] }> }>()
  for (const group of sourceGroups(routeSource, dataset, gravityType)) {
    for (const point of group.route.points) {
      const section = sourcePointIds.has(point.id)
        ? resolveRegion(point.stateId, point.mapCoordinate)
        : null
      const areaId = section?.id ?? `context:${group.id}`
      const area = areas.get(areaId) ?? { label: section?.label ?? group.label, groups: new Map() }
      const bucket = area.groups.get(group.id) ?? { source: group, points: [] }
      bucket.points.push(point)
      area.groups.set(group.id, bucket)
      areas.set(areaId, area)
    }
  }
  const groups = [...areas.entries()].flatMap(([areaId, area]) => [...area.groups].map(([contextId, bucket]) => ({
    ...bucket.source,
    id: `export:${areaId}:${contextId}`,
    label: area.label,
    matchingLocationCount: bucket.points.length,
    route: { ...bucket.source.route, points: bucket.points },
  })))
  return {
    groups,
    totalCost: routeSource.totalCost,
    totalPoints: groups.reduce((sum, group) => sum + group.route.points.length, 0),
  }
}
