import type { LayeredMapDefinition, MapNavigationCountry, RegionLabel } from '../../../src/domain/types.ts'
import { officialToMapCoordinate } from '../../../src/map/projection.ts'
import { asArray, asNumber, asRecord, asString } from '../raw.ts'
import type { CatalogTypeInfo } from './types.ts'

export const STATIC_ROOT = 'https://web-static.kurobbs.com'

export function normalizeName(name: string): string {
  return name.trim().replaceAll(/\s+/gu, ' ')
}

export function iconUrl(path: unknown): string {
  const value = asString(path)
  if (value.length === 0 || /^(?:https?:)?\/\//u.test(value) || value.startsWith('data:')) {
    return value
  }

  return `${STATIC_ROOT}/${value.replace(/^\/+/, '')}`
}

export function nullableId(value: unknown): string | null {
  const result = asString(value).trim()
  return result.length === 0 || result === '0' ? null : result
}

export function normalizeLayers(value: unknown): LayeredMapDefinition[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((rawLayer) => {
    const layer = asRecord(rawLayer, 'layered map')
    const layeredMapId = asString(layer.id)
    const floors = Array.isArray(layer.floors) ? layer.floors : []
    return {
      id: layeredMapId,
      name: asString(layer.name),
      floors: floors.map((rawFloor) => {
        const floor = asRecord(rawFloor, 'layered map floor')
        return {
          id: asString(floor.id),
          name: asString(floor.name),
          layeredMapId,
          tiles: Array.isArray(floor.tiles) ? floor.tiles.map((tile) => asString(tile)) : [],
        }
      }),
    }
  })
}

export function flattenRegions(value: unknown): RegionLabel[] {
  if (!Array.isArray(value)) {
    return []
  }

  const labels: RegionLabel[] = []

  function visit(raw: unknown, fallbackCountryId: number, fallbackStateId: number, level: number, path: string): void {
    const item = asRecord(raw, 'country item')
    const name = asString(item.name).trim()
    const stateId = asNumber(item.stateId, fallbackStateId)
    const countryId = asNumber(item.countryId, fallbackCountryId)
    const rawX = asNumber(item.xPosition)
    const rawY = asNumber(item.yPosition)
    if (name.length > 0) {
      labels.push({
        id: `${countryId}:${stateId}:${path}:${name}`,
        name,
        stateId,
        countryId,
        level: asNumber(item.level, level),
        coordinate: officialToMapCoordinate(rawX, rawY),
      })
    }

    const directChildren = Array.isArray(item.countrys) ? item.countrys : Array.isArray(item.children) ? item.children : []
    directChildren.forEach((child, index) => visit(child, countryId, stateId, level + 1, `${path}.${index}`))
  }

  value.forEach((country, index) => {
    const record = asRecord(country, 'country')
    visit(country, asNumber(record.countryId), asNumber(record.stateId, 8), 1, String(index))
  })
  return labels
}

export function normalizeMapNavigation(value: unknown): MapNavigationCountry[] {
  if (!Array.isArray(value)) return []

  // Reuse label IDs and coordinates so navigation and map labels share a destination.
  const labels = flattenRegions(value)
  return value.map((rawCountry, countryIndex) => {
    const country = asRecord(rawCountry, 'navigation country')
    const countryId = asNumber(country.countryId)
    const children = Array.isArray(country.countrys) ? country.countrys
      : Array.isArray(country.children) ? country.children : []
    const regions = children.map((rawRegion, regionIndex) => {
      const region = asRecord(rawRegion, 'navigation region')
      const id = `${asNumber(region.countryId, countryId)}:${asNumber(region.stateId, asNumber(country.stateId, 8))}:${countryIndex}.${regionIndex}:${asString(region.name).trim()}`
      return { id, groupId: asString(region.mapState).trim() }
    }).filter(({ id }) => labels.some((label) => label.id === id))
    const groupIds = asString(country.mapStateId).split(',').map((id) => id.trim())
    const groupNames = asString(country.mapStateName).split(',').map((name) => name.trim())
    const groups = groupIds.flatMap((id, index) => {
      const name = groupNames[index]
      const regionIds = regions.filter((region) => region.groupId === id).map((region) => region.id)
      return id && name && regionIds.length ? [{ id, name, regionIds }] : []
    })
    return { id: countryId, name: asString(country.name).trim(), regionIds: regions.map(({ id }) => id), groups }
  })
}

export function indexCatalogTypes(value: unknown): Map<string, CatalogTypeInfo> {
  const result = new Map<string, CatalogTypeInfo>()
  for (const rawCategory of asArray(value, 'map catalog')) {
    const category = asRecord(rawCategory, 'map catalog category')
    const categoryId = asString(category.id)
    const categoryName = asString(category.name)
    const children = Array.isArray(category.children) ? category.children : []
    for (const rawType of children) {
      const type = asRecord(rawType, 'map catalog type')
      const typeId = asString(type.id)
      if (typeId.length > 0) {
        result.set(typeId, { categoryId, categoryName, tableName: asString(type.tableName) })
      }
    }
  }
  return result
}
