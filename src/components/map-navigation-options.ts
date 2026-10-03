import { pointRegionResolver } from '../domain/point-region.ts'
import type { MapDataset } from '../domain/types.ts'
import type { WuCascaderOption } from './base/cascader.ts'

type MapNavigationData = Pick<MapDataset, 'mapNavigation' | 'regionLabels'>

export function mapNavigationSectionAtCenter(
  dataset: MapNavigationData,
  stateId: number,
  center: readonly [number, number],
): { name: string, expandedValues: readonly string[] } | null {
  const region = pointRegionResolver(dataset)(stateId, center)
  if (!region) return null
  return {
    name: region.name,
    expandedValues: region.groupId === null
      ? [`country:${region.countryId}`]
      : [`country:${region.countryId}`, `group:${region.countryId}:${region.groupId}`],
  }
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
