import { pointRegionResolver } from './point-region.ts'
import type { MapDataset } from './types.ts'

type RegionDataset = Pick<MapDataset, 'mapNavigation' | 'regionLabels'>

// Official echo coverage stops before Mengzhou. New maps and groups stay excluded.
const includedRegionsByState = new Map<number, readonly string[]>([
  [8, ['1-1', '3-3', '3-4', '4-6', '900']],
  [900, ['900']],
  [902, ['3-3']],
  [903, ['3-3']],
  [905, ['3-3']],
  [906, ['4-5']],
  [909, ['4-7']],
  [910, ['900']],
])

export function isOfficialEchoMapIncluded(dataset: RegionDataset, stateId: number, coordinate: readonly [number, number]): boolean {
  const included = includedRegionsByState.get(stateId)
  if (!included) return false
  const region = pointRegionResolver(dataset)(stateId, coordinate)
  return region !== null && included.includes(region.id)
}

export function selectOfficialEchoLocations(dataset: RegionDataset & Pick<MapDataset, 'echoLocations'>): MapDataset['echoLocations'] {
  return dataset.echoLocations.filter((point) => isOfficialEchoMapIncluded(
    dataset, point.stateId, [point.coordinate.mapX, point.coordinate.mapY],
  ))
}
