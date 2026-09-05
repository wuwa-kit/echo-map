import type { EchoLocation, GameCoordinate, PointQuality } from '../../../src/domain/types.ts'
import { officialToMapCoordinate } from '../../../src/map/projection.ts'
import { asArray, asNumber, asRecord, asString } from '../raw.ts'
import type { UnknownRecord } from '../raw.ts'
import type { WikiSnapshot } from '../wiki.ts'
import { iconUrl, indexCatalogTypes, normalizeName, nullableId } from './normalize.ts'
import type {
  AliasData,
  CatalogTypeInfo,
  ManualData,
  ManualPoint,
  MapStatePayload,
  NavigationConfig,
  NavigationPointDraft,
  NavigationRule,
} from './types.ts'

function manualCoordinate(point: ManualPoint | undefined): GameCoordinate | null {
  return point ? { x: point.x, y: point.y, z: point.z } : null
}

function navigationClassification(
  typeId: string,
  catalogType: CatalogTypeInfo | undefined,
  config: NavigationConfig,
): (CatalogTypeInfo & NavigationRule) | null {
  const rule = config.types[typeId]
    ?? (catalogType ? config.includeTableNames[catalogType.tableName] : undefined)
  if (!rule) {
    return null
  }
  return {
    categoryId: catalogType?.categoryId ?? 'configured',
    categoryName: catalogType?.categoryName ?? '配置定位点',
    tableName: catalogType?.tableName ?? '',
    ...rule,
  }
}

function locationBase(
  location: UnknownRecord,
  type: UnknownRecord,
  fallbackStateId: number,
  manual: ManualPoint | undefined,
) {
  const rawX = asNumber(location.x)
  const rawY = asNumber(location.y)
  return {
    id: asString(location.id),
    typeId: asString(type.id),
    typeName: asString(type.name),
    iconUrl: iconUrl(type.icon),
    stateId: asNumber(location.stateId, fallbackStateId),
    countryId: location.countryId === '' || location.countryId === null || location.countryId === undefined
      ? null
      : asNumber(location.countryId),
    layeredMapId: nullableId(location.floorId),
    levelId: nullableId(location.level),
    coordinate: officialToMapCoordinate(rawX, rawY),
    gameCoordinate: manualCoordinate(manual),
    quality: manual?.quality ?? 'official-provisional' as PointQuality,
  }
}

export function normalizeLocations(
  wiki: WikiSnapshot,
  manual: ManualData,
  aliases: AliasData,
  navigationConfig: NavigationConfig,
  statePayloads: readonly MapStatePayload[],
) {
  const echoByName = new Map(wiki.echoes.map((echo) => [normalizeName(echo.name), echo]))
  const manualEchoByLocation = new Map(manual.echoLocations
    .filter((point) => point.officialLocationId !== undefined)
    .map((point) => [point.officialLocationId as string, point]))
  const manualNavigationByLocation = new Map(manual.navigationPoints
    .filter((point) => point.officialLocationId !== undefined)
    .map((point) => [point.officialLocationId as string, point]))
  const echoLocations = new Map<string, EchoLocation>()
  const navigationPoints = new Map<string, NavigationPointDraft>()
  const exactMatchedEchoIds = new Set<string>()
  const aliasMatchedEchoIds = new Set<string>()

  for (const { state, positionData, catalogData } of statePayloads) {
    const catalogTypes = indexCatalogTypes(catalogData)
    for (const rawType of asArray(positionData, `position ${state.id}`)) {
      const type = asRecord(rawType, 'position type')
      const typeId = asString(type.id)
      const typeName = normalizeName(asString(type.name))
      const navigation = navigationClassification(typeId, catalogTypes.get(typeId), navigationConfig)
      const aliasName = aliases.byTypeId[typeId]
      const exactEcho = echoByName.get(typeName)
      const echo = exactEcho ?? (aliasName ? echoByName.get(normalizeName(aliasName)) : undefined)
      if (exactEcho) {
        exactMatchedEchoIds.add(exactEcho.id)
      } else if (echo) {
        aliasMatchedEchoIds.add(echo.id)
      }

      const locations = Array.isArray(type.location) ? type.location : []
      for (const rawLocation of locations) {
        const location = asRecord(rawLocation, 'position location')
        const locationId = asString(location.id)
        if (echo && !echoLocations.has(locationId)) {
          echoLocations.set(locationId, {
            ...locationBase(location, type, state.id, manualEchoByLocation.get(locationId)),
            echoId: echo.id,
          })
        }

        if (navigation && !navigationPoints.has(locationId)) {
          navigationPoints.set(locationId, {
            ...locationBase(location, type, state.id, manualNavigationByLocation.get(locationId)),
            catalogCategoryId: navigation.categoryId,
            catalogCategoryName: navigation.categoryName,
            mode: navigation.mode,
            kind: navigation.kind,
          })
        }
      }
    }
  }

  const consumedManualEchoIds = new Set([...echoLocations.values()]
    .filter(({ gameCoordinate }) => gameCoordinate !== null)
    .map(({ id }) => id))
  for (const point of manual.echoLocations) {
    if (point.officialLocationId && consumedManualEchoIds.has(point.officialLocationId)) {
      continue
    }

    const echo = echoByName.get(normalizeName(point.echoName ?? ''))
    if (!echo) {
      throw new Error(`人工声骸点 ${point.id} 引用了未知声骸：${point.echoName ?? ''}`)
    }

    const coordinate = officialToMapCoordinate(point.x * 100, point.y * 100)
    echoLocations.set(point.id, {
      id: point.id,
      typeId: `manual:${echo.id}`,
      typeName: echo.name,
      iconUrl: echo.iconUrl,
      stateId: point.stateId,
      countryId: point.countryId,
      layeredMapId: null,
      levelId: point.levelId,
      coordinate,
      gameCoordinate: manualCoordinate(point),
      quality: point.quality,
      echoId: echo.id,
    })
  }

  return {
    echoLocations: [...echoLocations.values()],
    navigationPoints: [...navigationPoints.values()],
    exactMatchedEchoIds,
    aliasMatchedEchoIds,
  }
}
