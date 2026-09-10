import { readFile } from 'node:fs/promises'
import { parsePointLibrary, emptyPointLibrary } from '../../src/domain/point-library.ts'
import type { AuthoredEchoPoint, AuthoredPoint, MapDataset, PointLibrary } from '../../src/domain/types.ts'

export const OFFICIAL_ECHO_MERGE_DIAMETER = 25

type OfficialEchoLocation = MapDataset['echoLocations'][number]
type OfficialRegionLabel = MapDataset['regionLabels'][number]

interface OfficialEchoCluster {
  id: string
  locations: OfficialEchoLocation[]
}

export function inferOfficialEchoCountryId(
  location: OfficialEchoLocation,
  regionLabels: readonly OfficialRegionLabel[],
): number | null {
  const validCountryIds = new Set(regionLabels.flatMap((label) => (
    label.stateId === location.stateId && label.level === 1 && label.countryId !== null
      ? [label.countryId]
      : []
  )))
  let nearest: OfficialRegionLabel | undefined
  let nearestDistanceSquared = Number.POSITIVE_INFINITY
  for (const label of regionLabels) {
    if (label.stateId !== location.stateId || label.level < 2) continue
    const x = label.coordinate.mapX - location.coordinate.mapX
    const y = label.coordinate.mapY - location.coordinate.mapY
    const distanceSquared = x * x + y * y
    if (
      distanceSquared < nearestDistanceSquared
      || (distanceSquared === nearestDistanceSquared && label.id.localeCompare(nearest?.id ?? '') < 0)
    ) {
      nearest = label
      nearestDistanceSquared = distanceSquared
    }
  }
  if (nearest?.countryId !== null && nearest?.countryId !== undefined && validCountryIds.has(nearest.countryId)) {
    return nearest.countryId
  }
  return location.countryId !== null && validCountryIds.has(location.countryId) ? location.countryId : null
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
  const points: AuthoredPoint[] = []
  const validCountries = new Set(dataset.regionLabels.filter(({ level }) => level === 1).map(({ stateId, countryId }) => `${stateId}:${countryId}`))
  const echoLocations = dataset.echoLocations.map((location) => {
    const countryId = inferOfficialEchoCountryId(location, dataset.regionLabels)
    return countryId === location.countryId ? location : { ...location, countryId }
  })
  const makeBase = (point: MapDataset['echoLocations'][number] | MapDataset['navigationPoints'][number]) => {
    return {
      id: `official:${point.id}`,
      status: 'imported' as const,
      officialIds: [point.id],
      stateId: point.stateId,
      gravityType: point.gravityType,
      countryId: validCountries.has(`${point.stateId}:${point.countryId}`) ? point.countryId : null,
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
    const sourceDescription = cluster.locations.length === 1
      ? '每个来源点按 1 只计数'
      : `由 ${cluster.locations.length} 个相邻点合并（最大直径 ${OFFICIAL_ECHO_MERGE_DIAMETER}）；每个来源点按 1 只计数`
    const point: AuthoredEchoPoint = {
      ...makeBase(representative),
      id: `official:${officialIds[0]}`,
      officialIds,
      kind: 'echo',
      compositionStatus: 'partial',
      members,
      note: `官方导入：${sourceDescription}；Z=0 为占位值，待实测。`,
    }
    points.push(point)
  }
  for (const location of dataset.navigationPoints) {
    points.push({ ...makeBase(location), kind: 'navigation', name: location.typeName, navigationKind: location.kind, mode: location.mode, note: '官方导入：Z=0 为占位值，待实测。', ...(location.teleportCoordinate ? { teleportCoordinate: location.teleportCoordinate } : {}) })
  }
  return parsePointLibrary({ version: 1, points }, dataset, 'official')
}

export async function readOfficialPointLibrary(path: string, dataset: MapDataset): Promise<PointLibrary> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return emptyPointLibrary()
    throw error
  }
  return parsePointLibrary(JSON.parse(text), dataset, 'official')
}
