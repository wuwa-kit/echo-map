import type { MapDataset } from '../domain/types.ts'
import type { WuCascaderOption } from './base/cascader.ts'

export function mapNavigationOptions(dataset: Pick<MapDataset, 'mapNavigation' | 'regionLabels'>): WuCascaderOption[] {
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
