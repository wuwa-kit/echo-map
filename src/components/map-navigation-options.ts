import type { MapDataset } from '../domain/types.ts'
import type { WuCascaderOption } from './base/cascader.ts'

type MapNavigationData = Pick<MapDataset, 'mapNavigation' | 'regionLabels'>

export function mapNavigationSectionAtCenter(
  dataset: MapNavigationData,
  stateId: number,
  center: readonly [number, number],
): string | null {
  const regions = new Map(dataset.regionLabels.map((region) => [region.id, region]))
  let closestName: string | null = null
  let closestDistance = Number.POSITIVE_INFINITY
  const consider = (name: string, regionIds: readonly string[]) => {
    for (const id of regionIds) {
      const region = regions.get(id)
      if (!region || region.stateId !== stateId) continue
      const distance = (region.coordinate.mapX - center[0]) ** 2 + (region.coordinate.mapY - center[1]) ** 2
      if (distance >= closestDistance) continue
      closestName = name
      closestDistance = distance
    }
  }
  for (const country of dataset.mapNavigation) {
    if (country.groups.length) {
      for (const group of country.groups) consider(group.name, group.regionIds)
      continue
    }
    for (const id of country.regionIds) {
      const region = regions.get(id)
      if (region) consider(region.name, [id])
    }
  }
  return closestName
}

export function mapNavigationOptions(dataset: MapNavigationData): WuCascaderOption[] {
  const byId = new Map(dataset.regionLabels.map((region) => [region.id, region]))
  const destinations = (ids: readonly string[]): WuCascaderOption[] => ids.flatMap((id) => {
    const region = byId.get(id)
    return region ? [{ value: region.id, label: region.name }] : []
  })
  return dataset.mapNavigation.map((country) => ({
    value: `country:${country.id}`,
    label: country.name,
    children: country.groups.length ? country.groups.map((group) => ({
      value: `group:${country.id}:${group.id}`,
      label: group.name,
      children: destinations(group.regionIds),
    })) : destinations(country.regionIds),
  }))
}
