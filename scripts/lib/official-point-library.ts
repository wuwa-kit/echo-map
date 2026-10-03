import { pointRegionResolver } from '../../src/domain/point-region.ts'
import { selectOfficialEchoLocations } from '../../src/domain/official-echo-scope.ts'
import { readPointLibrary } from './point-files.ts'
import { parsePointLibrary } from '../../src/domain/point-library.ts'
import type { AuthoredEchoPoint, MapDataset, PointLibrary } from '../../src/domain/types.ts'

export const OFFICIAL_ECHO_MERGE_DIAMETER = 25

type OfficialEchoLocation = MapDataset['echoLocations'][number]

interface OfficialEchoCluster {
  id: string
  locations: OfficialEchoLocation[]
}

export function inferOfficialEchoCountryId(location: OfficialEchoLocation, dataset: Pick<MapDataset, 'mapNavigation' | 'regionLabels'>): number | null {
  return pointRegionResolver(dataset)(location.stateId, [location.coordinate.mapX, location.coordinate.mapY])?.countryId ?? null
}

function officialEchoScopeKey(location: OfficialEchoLocation): string {
  return JSON.stringify([location.stateId, location.countryId, location.levelId, location.gravityType])
}

function sourceDistanceSquared(left: OfficialEchoLocation, right: OfficialEchoLocation): number {
  const x = left.coordinate.rawX - right.coordinate.rawX
  const y = left.coordinate.rawY - right.coordinate.rawY
  return x * x + y * y
}

function clusterOfficialEchoLocations(locations: readonly OfficialEchoLocation[]): OfficialEchoCluster[] {
  const maximumDistanceSquared = (OFFICIAL_ECHO_MERGE_DIAMETER * 100) ** 2
  const locationsByScope = new Map<string, OfficialEchoLocation[]>()
  for (const location of locations) {
    const key = officialEchoScopeKey(location)
    const group = locationsByScope.get(key)
    if (group) group.push(location)
    else locationsByScope.set(key, [location])
  }

  const result: OfficialEchoCluster[] = []
  for (const scopeLocations of locationsByScope.values()) {
    const clusters: OfficialEchoCluster[] = []
    const orderedLocations = [...scopeLocations].sort((left, right) => (
      left.coordinate.rawX - right.coordinate.rawX
      || left.coordinate.rawY - right.coordinate.rawY
      || left.id.localeCompare(right.id)
    ))
    for (const location of orderedLocations) {
      let bestCluster: OfficialEchoCluster | undefined
      let bestMaximumDistanceSquared = Number.POSITIVE_INFINITY
      for (const cluster of clusters) {
        let maximumClusterDistanceSquared = 0
        for (const member of cluster.locations) {
          const distanceSquared = sourceDistanceSquared(location, member)
          if (distanceSquared > maximumDistanceSquared) {
            maximumClusterDistanceSquared = Number.POSITIVE_INFINITY
            break
          }
          maximumClusterDistanceSquared = Math.max(maximumClusterDistanceSquared, distanceSquared)
        }
        if (
          maximumClusterDistanceSquared < bestMaximumDistanceSquared
          || (maximumClusterDistanceSquared === bestMaximumDistanceSquared && cluster.id.localeCompare(bestCluster?.id ?? '') < 0)
        ) {
          bestCluster = cluster
          bestMaximumDistanceSquared = maximumClusterDistanceSquared
        }
      }
      if (bestCluster) {
        bestCluster.locations.push(location)
        if (location.id.localeCompare(bestCluster.id) < 0) bestCluster.id = location.id
      } else {
        clusters.push({ id: location.id, locations: [location] })
      }
    }
    result.push(...clusters)
  }
  return result.sort((left, right) => left.id.localeCompare(right.id))
}

function clusterRepresentative(cluster: OfficialEchoCluster): OfficialEchoLocation {
  const centerX = cluster.locations.reduce((sum, location) => sum + location.coordinate.rawX, 0) / cluster.locations.length
  const centerY = cluster.locations.reduce((sum, location) => sum + location.coordinate.rawY, 0) / cluster.locations.length
  const representative = [...cluster.locations].sort((left, right) => {
    const leftDistance = (left.coordinate.rawX - centerX) ** 2 + (left.coordinate.rawY - centerY) ** 2
    const rightDistance = (right.coordinate.rawX - centerX) ** 2 + (right.coordinate.rawY - centerY) ** 2
    return leftDistance - rightDistance || left.id.localeCompare(right.id)
  })[0]
  if (!representative) throw new Error('官方声骸聚类不能为空')
  return representative
}

export function convertOfficialPoints(dataset: MapDataset): PointLibrary {
  const points: AuthoredEchoPoint[] = []
  const echoLocations = selectOfficialEchoLocations(dataset).map((location) => {
    const countryId = inferOfficialEchoCountryId(location, dataset)
    return countryId === location.countryId ? location : { ...location, countryId }
  })
  const makeBase = (point: MapDataset['echoLocations'][number]) => {
    return {
      id: `official:${point.id}`,
      officialIds: [point.id],
      stateId: point.stateId,
      gravityType: point.gravityType,
      levelId: point.levelId,
      coordinate: { x: Math.round(point.coordinate.rawX / 100), y: Math.round(point.coordinate.rawY / 100), z: 0 },
    }
  }
  for (const cluster of clusterOfficialEchoLocations(echoLocations)) {
    const representative = clusterRepresentative(cluster)
    const officialIds = cluster.locations.map(({ id }) => id).sort((left, right) => left.localeCompare(right))
    const memberCounts = new Map<string, number>()
    for (const { echoId } of cluster.locations) memberCounts.set(echoId, (memberCounts.get(echoId) ?? 0) + 1)
    const members = [...memberCounts].sort(([left], [right]) => left.localeCompare(right)).map(([echoId, count]) => ({ echoId, count }))
    const point: AuthoredEchoPoint = {
      ...makeBase(representative),
      id: `official:${officialIds[0]}`,
      officialIds,
      kind: 'echo',
      members,
    }
    points.push(point)
  }
  return parsePointLibrary({ version: 1, points }, dataset, 'official')
}

export function readOfficialPointLibrary(path: string, dataset: MapDataset): Promise<PointLibrary> {
  return readPointLibrary(path, dataset, 'official')
}
