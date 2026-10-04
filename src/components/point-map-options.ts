import { MAIN_MAP_STATE_ID } from '../domain/point-region.ts'
import type { PointRegion } from '../domain/point-region.ts'
import type { AuthoredPoint, MapDataset } from '../domain/types.ts'
import type { WuCascaderOption } from './base/cascader.ts'

export interface PointMapFilterOption extends WuCascaderOption {
  pathLabel: string
  children?: readonly PointMapFilterOption[]
}

export function pointMapScopeValues(stateId: number, region: PointRegion | null): string[] {
  return region
    ? ['', `country:${region.countryId}`, `region:${region.id}`, `map:${region.id}:${stateId}`]
    : ['']
}

export function pointMapFilterCounts(points: readonly AuthoredPoint[], regions: ReadonlyMap<string, PointRegion | null>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const point of points) {
    for (const value of pointMapScopeValues(point.stateId, regions.get(point.id) ?? null)) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return counts
}

export function pointMapFilterOptions(
  dataset: Pick<MapDataset, 'states' | 'mapNavigation' | 'regionLabels'>,
  counts: ReadonlyMap<string, number>,
): PointMapFilterOption[] {
  const states = new Map(dataset.states.map(state => [state.id, state]))
  const regions = new Map(dataset.regionLabels.map(region => [region.id, region]))
  const option = (value: string, label: string, pathLabel: string, children?: PointMapFilterOption[]): PointMapFilterOption => ({
    value: children ? `browse:${value}` : value,
    label, pathLabel, count: counts.get(value) ?? 0,
    disabled: !children && value !== '' && !counts.get(value),
    children,
  })
  const maps = (regionId: string, pathLabel: string, regionIds: readonly string[]) => {
    const stateIds = new Set(regionIds.flatMap(id => {
      const region = regions.get(id)
      return region && states.has(region.stateId) ? [region.stateId] : []
    }))
    return [...stateIds].sort((a, b) => a === MAIN_MAP_STATE_ID ? -1 : b === MAIN_MAP_STATE_ID ? 1 : a - b).map(stateId => {
      const mapName = states.get(stateId)?.name ?? String(stateId)
      return option(`map:${regionId}:${stateId}`, stateId === MAIN_MAP_STATE_ID ? '地表' : mapName,
        `${pathLabel}-${stateId === MAIN_MAP_STATE_ID ? '地表' : mapName}`)
    })
  }
  return [
    option('', '全部', '全部地图 / 地区'),
    ...dataset.mapNavigation.map(country => {
      const value = `country:${country.id}`
      const children = country.groups.length ? country.groups.map(group => {
        const regionId = `${country.id}-${group.id}`
        const groupValue = `region:${regionId}`
        const pathLabel = `${country.name}-${group.name}`
        const children = maps(regionId, pathLabel, group.regionIds)
        return option(groupValue, group.name, pathLabel, children.length > 1
          ? [option(groupValue, '全部', pathLabel), ...children]
          : undefined)
      }) : maps(String(country.id), country.name, country.regionIds)
      return option(value, country.name, country.name, [option(value, '全部', country.name), ...children])
    }),
  ]
}

export function pointMapFilterSelection(options: readonly PointMapFilterOption[], value: string) {
  function find(items: readonly PointMapFilterOption[], path: string[]): { value: string; label: string; expandedValues: string[] } | null {
    for (const item of items) {
      if (!item.children?.length && item.value === value) return { value, label: item.pathLabel, expandedValues: path }
      if (item.children) {
        const match = find(item.children, [...path, item.value])
        if (match) return match
      }
    }
    return null
  }
  return find(options, []) ?? { value: '', label: '全部地图 / 地区', expandedValues: [] }
}
