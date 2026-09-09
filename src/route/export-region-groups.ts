import type { GravityType, MapDataset, RoutePlanGroup, RoutePlanResult, RoutePoint, RouteResult } from '../domain/types.ts'

type RegionDataset = Pick<MapDataset, 'mapNavigation' | 'regionLabels' | 'states'>

interface RegionSection {
  id: string
  label: string
  countryId: number
  anchors: { stateId: number; x: number; y: number }[]
}

function regionSections(dataset: RegionDataset): RegionSection[] {
  const regions = new Map(dataset.regionLabels.map((region) => [region.id, region]))
  return dataset.mapNavigation.flatMap((country) => {
    if (country.groups.length) {
      return country.groups.map((group) => ({
        id: `country:${country.id}:group:${group.id}`,
        label: `${country.name}-${group.name}`,
        countryId: country.id,
        anchors: group.regionIds.flatMap((id) => {
          const region = regions.get(id)
          return region ? [{ stateId: region.stateId, x: region.coordinate.mapX, y: region.coordinate.mapY }] : []
        }),
      }))
    }
    return country.regionIds.flatMap((id) => {
      const region = regions.get(id)
      return region ? [{
        id: `country:${country.id}:region:${region.id}`,
        label: `${country.name}-${region.name}`,
        countryId: country.id,
        anchors: [{ stateId: region.stateId, x: region.coordinate.mapX, y: region.coordinate.mapY }],
      }] : []
    })
  })
}

function closestSection(
  sections: readonly RegionSection[],
  point: RoutePoint,
  countryId: number | null,
): RegionSection | null {
  let closest: RegionSection | null = null
  let closestDistance = Number.POSITIVE_INFINITY
  for (const section of sections) {
    if (countryId !== null && section.countryId !== countryId) continue
    for (const anchor of section.anchors) {
      if (anchor.stateId !== point.stateId) continue
      const distance = (anchor.x - point.mapCoordinate[0]) ** 2 + (anchor.y - point.mapCoordinate[1]) ** 2
      if (distance >= closestDistance) continue
      closest = section
      closestDistance = distance
    }
  }
  return closest
}

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
  countryIdByPointId: ReadonlyMap<string, number | null>,
  gravityType: GravityType,
): RoutePlanResult {
  const sections = regionSections(dataset)
  const areas = new Map<string, { label: string; groups: Map<string, { source: RoutePlanGroup; points: RouteResult['points'] }> }>()
  for (const group of sourceGroups(routeSource, dataset, gravityType)) {
    for (const point of group.route.points) {
      const section = countryIdByPointId.has(point.id)
        ? closestSection(sections, point, countryIdByPointId.get(point.id) ?? null)
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
