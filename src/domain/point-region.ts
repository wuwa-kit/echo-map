import type { MapDataset } from './types.ts'

export const MAIN_MAP_STATE_ID = 8

type RegionDataset = Pick<MapDataset, 'mapNavigation' | 'regionLabels'>

export interface PointRegion {
  id: string
  countryId: number
  groupId: string | null
  name: string
  label: string
}

const resolvers = new WeakMap<RegionDataset, ReturnType<typeof buildResolver>>()

function buildResolver(dataset: RegionDataset) {
  const labels = new Map(dataset.regionLabels.map((label) => [label.id, label]))
  const sections = dataset.mapNavigation.flatMap((country) => {
    const groups = country.groups.length ? country.groups : [{ id: null, name: country.name, regionIds: country.regionIds }]
    return groups.map((group) => ({
      region: {
        id: group.id === null ? `${country.id}` : `${country.id}-${group.id}`,
        countryId: country.id,
        groupId: group.id,
        name: group.name,
        label: group.id === null ? country.name : `${country.name}-${group.name}`,
      },
      anchors: group.regionIds.flatMap((id) => {
        const label = labels.get(id)
        return label ? [label] : []
      }),
    }))
  }).sort((left, right) => left.region.id.localeCompare(right.region.id))
  const independent = new Map<number, PointRegion>()
  for (const { region, anchors } of sections) {
    for (const anchor of anchors) {
      if (anchor.stateId === MAIN_MAP_STATE_ID) continue
      const previous = independent.get(anchor.stateId)
      if (previous && previous.id !== region.id) throw new Error(`地图 ${anchor.stateId} 对应了多个二级地区`)
      independent.set(anchor.stateId, region)
    }
  }
  return (stateId: number, coordinate?: readonly [number, number]): PointRegion | null => {
    if (stateId !== MAIN_MAP_STATE_ID) return independent.get(stateId) ?? null
    if (!coordinate) return null
    let closest: PointRegion | null = null
    let distance = Number.POSITIVE_INFINITY
    for (const { region, anchors } of sections) {
      for (const anchor of anchors) {
        if (anchor.stateId !== stateId) continue
        const next = (anchor.coordinate.mapX - coordinate[0]) ** 2 + (anchor.coordinate.mapY - coordinate[1]) ** 2
        if (next >= distance) continue
        closest = region
        distance = next
      }
    }
    return closest
  }
}

export function pointRegionResolver(dataset: RegionDataset): ReturnType<typeof buildResolver> {
  let resolver = resolvers.get(dataset)
  if (!resolver) {
    resolver = buildResolver(dataset)
    resolvers.set(dataset, resolver)
  }
  return resolver
}
