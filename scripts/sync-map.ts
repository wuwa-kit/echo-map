import { mapDatasetSchema } from '../src/domain/schema.ts'
import { createHash } from 'node:crypto'
import type {
  EchoLocation,
  GameCoordinate,
  LayeredMapDefinition,
  MapDataset,
  MapStateDefinition,
  NavigationKind,
  NavigationMode,
  NavigationPoint,
  NavigationPointGroup,
  PointQuality,
  RegionLabel,
  RouteConnector,
} from '../src/domain/types.ts'
import { calculateTileExtent, officialToMapCoordinate } from '../src/map/projection.ts'
import { isMainModule, projectPath, readJson, writeJson } from './lib/files.ts'
import { fetchBytes, fetchJson, fetchOptionalJson, kuroHeaders, postFormJson } from './lib/http.ts'
import { asArray, asNumber, asRecord, asString } from './lib/raw.ts'
import type { UnknownRecord } from './lib/raw.ts'
import type { WikiSnapshot } from './lib/wiki.ts'

const OFFICIAL_API = 'https://api.kurobbs.com'
const STATIC_ROOT = 'https://web-static.kurobbs.com'
const TILE_WIDTH = 1024

interface ManualPoint {
  id: string
  officialLocationId?: string
  echoName?: string
  stateId: number
  countryId: number | null
  levelId: string | null
  x: number
  y: number
  z: number
  quality: Exclude<PointQuality, 'official-provisional'>
  note: string
}

interface ManualData {
  echoLocations: ManualPoint[]
  navigationPoints: ManualPoint[]
  connectors: RouteConnector[]
}

interface AliasData {
  byTypeId: Record<string, string>
}

interface NavigationRule {
  mode: NavigationMode
  kind: NavigationKind
}

interface NavigationConfig {
  includeTableNames: Record<string, NavigationRule>
  types: Record<string, NavigationRule>
}

interface NavigationGroupConfig {
  namesByHash: Record<string, string>
}

type NavigationPointDraft = Omit<NavigationPoint, 'groupId'>

interface NavigationGroupingResult {
  points: NavigationPoint[]
  groups: NavigationPointGroup[]
  iconFetchFailureCount: number
}

interface CatalogTypeInfo {
  categoryId: string
  categoryName: string
  tableName: string
}

function normalizeName(name: string): string {
  return name.trim().replaceAll(/\s+/gu, ' ')
}

function iconUrl(path: unknown): string {
  const value = asString(path)
  if (value.length === 0 || /^(?:https?:)?\/\//u.test(value) || value.startsWith('data:')) {
    return value
  }

  return `${STATIC_ROOT}/${value.replace(/^\/+/, '')}`
}

function nullableId(value: unknown): string | null {
  const result = asString(value).trim()
  return result.length === 0 || result === '0' ? null : result
}

function manualCoordinate(point: ManualPoint | undefined): GameCoordinate | null {
  return point ? { x: point.x, y: point.y, z: point.z } : null
}

function normalizeLayers(value: unknown): LayeredMapDefinition[] {
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

function flattenRegions(value: unknown): RegionLabel[] {
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

function indexCatalogTypes(value: unknown): Map<string, CatalogTypeInfo> {
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

async function groupNavigationPoints(
  drafts: NavigationPointDraft[],
  config: NavigationGroupConfig,
): Promise<NavigationGroupingResult> {
  const iconUrls = [...new Set(drafts
    .filter(({ kind }) => kind !== 'boss')
    .map(({ iconUrl: url }) => url)
    .filter(Boolean))]
  const hashEntries = await Promise.all(iconUrls.map(async (url) => {
    try {
      const bytes = await fetchBytes(url)
      return [url, createHash('sha256').update(bytes).digest('hex')] as const
    } catch (error) {
      console.warn(`定位点图标下载失败，退回独立类型分组：${url}`, error)
      return [url, null] as const
    }
  }))
  const hashByUrl = new Map(hashEntries)
  const groupDrafts = new Map<string, {
    hash: string | null
    points: NavigationPointDraft[]
  }>()
  const fullHashByShortId = new Map<string, string>()

  for (const point of drafts) {
    const isBoss = point.kind === 'boss'
    const hash = isBoss ? null : hashByUrl.get(point.iconUrl) ?? null
    const groupId = isBoss ? 'kind:boss' : hash ? `icon:${hash.slice(0, 16)}` : `type:${point.typeId}`
    if (hash) {
      const previousHash = fullHashByShortId.get(groupId)
      if (previousHash && previousHash !== hash) {
        throw new Error(`定位点图标分组 ID 冲突：${groupId}`)
      }
      fullHashByShortId.set(groupId, hash)
    }
    const group = groupDrafts.get(groupId)
    if (group) {
      group.points.push(point)
    } else {
      groupDrafts.set(groupId, { hash, points: [point] })
    }
  }

  const groupIdByPointId = new Map<string, string>()
  const groups = [...groupDrafts.entries()].map(([id, group]): NavigationPointGroup => {
    const sortedPoints = [...group.points].sort((left, right) => (
      left.typeName.localeCompare(right.typeName, 'zh-CN') || left.typeId.localeCompare(right.typeId)
    ))
    const firstPoint = sortedPoints[0]
    if (!firstPoint) {
      throw new Error(`定位点图标分组为空：${id}`)
    }
    const typeIds = [...new Set(sortedPoints.map(({ typeId }) => typeId))]
    const typeNames = [...new Set(sortedPoints.map(({ typeName }) => typeName))]
    const firstTypeName = typeNames[0] ?? firstPoint.typeName
    const modes = [...new Set(sortedPoints.map(({ mode }) => mode))]
    const kinds = [...new Set(sortedPoints.map(({ kind }) => kind))]
    for (const point of group.points) {
      groupIdByPointId.set(point.id, id)
    }
    return {
      id,
      name: (id === 'kind:boss' ? 'BOSS' : undefined)
        ?? (group.hash ? config.namesByHash[group.hash] : undefined)
        ?? (typeNames.length === 1 ? firstTypeName : `${firstTypeName}等 ${typeNames.length} 类`),
      iconUrl: firstPoint.iconUrl,
      iconHash: group.hash,
      typeIds,
      typeNames,
      modes,
      kinds,
    }
  }).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN') || left.id.localeCompare(right.id))

  return {
    points: drafts.map((point) => ({
      ...point,
      groupId: groupIdByPointId.get(point.id) ?? `type:${point.typeId}`,
    })),
    groups,
    iconFetchFailureCount: hashEntries.filter(([, hash]) => hash === null).length,
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

async function fetchMapConfiguration(): Promise<{
  resourceHash: string
  states: { id: number; name: string }[]
  tileIdsByState: Record<string, string[]>
}> {
  const headers = kuroHeaders(10, 8)
  const [resourceResponse, selectionResponse, tileResponse] = await Promise.all([
    postFormJson<unknown>(`${OFFICIAL_API}/map/core/config/getMapResource`, headers, {}),
    fetchJson<unknown>(`${OFFICIAL_API}/map/core/position/getMapStateSelection`, { headers }),
    postFormJson<unknown>(`${OFFICIAL_API}/map/core/config/getMapIdList`, headers, {}),
  ])
  const resourceRoot = asRecord(resourceResponse, 'map resource response')
  const selectionRoot = asRecord(selectionResponse, 'map selection response')
  const tileRoot = asRecord(tileResponse, 'map tile response')
  const selectionData = asRecord(selectionRoot.data, 'map selection data')
  const states = asArray(selectionData.state, 'map states').map((value) => {
    const state = asRecord(value, 'map state')
    return { id: asNumber(state.id), name: asString(state.name) }
  })
  const rawTiles = asRecord(tileRoot.data, 'map tile data')
  const tileIdsByState = Object.fromEntries(Object.entries(rawTiles).map(([stateId, ids]) => [
    stateId,
    asArray(ids, `tiles ${stateId}`).map((id) => asString(id)),
  ]))

  return {
    resourceHash: asString(resourceRoot.data),
    states,
    tileIdsByState,
  }
}

export async function syncMap(wikiInput?: WikiSnapshot): Promise<MapDataset> {
  const wiki = wikiInput ?? await readJson<WikiSnapshot>(projectPath('data', 'generated', 'wiki.json'))
  const manual = await readJson<ManualData>(projectPath('data', 'manual', 'locations.json'))
  const aliases = await readJson<AliasData>(projectPath('data', 'config', 'map-echo-aliases.json'))
  const navigationConfig = await readJson<NavigationConfig>(projectPath('data', 'config', 'map-navigation-types.json'))
  const navigationGroupConfig = await readJson<NavigationGroupConfig>(projectPath('data', 'config', 'map-navigation-icon-groups.json'))
  const mapFetchedAt = new Date().toISOString()
  console.log('正在抓取官方地图资源清单、分层和点位…')
  const configuration = await fetchMapConfiguration()
  const countryUrl = `${STATIC_ROOT}/mcmap/country/${configuration.resourceHash}/country.json`
  const countryData = await fetchOptionalJson<unknown>(countryUrl, [])
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

  const statePayloads = await Promise.all(configuration.states.map(async (state) => {
    const [positionData, layerData, catalogData] = await Promise.all([
      fetchOptionalJson<unknown>(`${STATIC_ROOT}/mcmap/position/${state.id}/position.json`, []),
      fetchOptionalJson<unknown>(`${STATIC_ROOT}/mcmap/layer/${configuration.resourceHash}/${state.id}/layer.json`, []),
      fetchOptionalJson<unknown>(`${STATIC_ROOT}/mcmap/catalog/${configuration.resourceHash}/${state.id}/catalog.json`, []),
    ])
    return { state, positionData, layerData, catalogTypes: indexCatalogTypes(catalogData) }
  }))

  const states: MapStateDefinition[] = statePayloads.map(({ state, layerData }) => {
    const tileIds = configuration.tileIdsByState[String(state.id)] ?? []
    return {
      id: state.id,
      name: state.name,
      tileIds,
      tileExtent: calculateTileExtent(tileIds),
      layeredMaps: normalizeLayers(layerData),
    }
  })

  for (const { state, positionData, catalogTypes } of statePayloads) {
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

  const matchedEchoIds = new Set([...exactMatchedEchoIds, ...aliasMatchedEchoIds])
  const normalizedEchoLocations = [...echoLocations.values()]
  console.log('正在按图标内容整理定位点显示分组…')
  const navigationGrouping = await groupNavigationPoints([...navigationPoints.values()], navigationGroupConfig)
  const normalizedNavigationPoints = navigationGrouping.points
  const report = {
    wikiEchoCount: wiki.totalEchoCount,
    includedEchoCount: wiki.echoes.length,
    excludedEchoCount: wiki.excludedEchoNames.length,
    sonataCount: wiki.sonatas.length,
    exactMatchedEchoCount: exactMatchedEchoIds.size,
    aliasMatchedEchoCount: aliasMatchedEchoIds.size,
    unmatchedEchoNames: wiki.echoes.filter((echo) => !matchedEchoIds.has(echo.id)).map((echo) => echo.name),
    provisionalEchoLocationCount: normalizedEchoLocations.filter(({ gameCoordinate }) => gameCoordinate === null).length,
    routeEligibleEchoLocationCount: normalizedEchoLocations.filter(({ gameCoordinate }) => gameCoordinate !== null).length,
    navigationPointCount: normalizedNavigationPoints.length,
    navigationPointGroupCount: navigationGrouping.groups.length,
    bossNavigationPointCount: normalizedNavigationPoints.filter(({ kind }) => kind === 'boss').length,
    challengeNavigationPointCount: normalizedNavigationPoints.filter(({ catalogCategoryName }) => catalogCategoryName === '挑战').length,
    navigationIconFetchFailureCount: navigationGrouping.iconFetchFailureCount,
    routeEligibleNavigationPointCount: normalizedNavigationPoints.filter(({ mode, gameCoordinate }) => (
      mode === 'fast-travel' && gameCoordinate !== null
    )).length,
  }
  const dataset: MapDataset = {
    version: 3,
    source: {
      generatedAt: new Date().toISOString(),
      wikiFetchedAt: wiki.fetchedAt,
      mapFetchedAt,
      mapResourceHash: configuration.resourceHash,
      tileWidth: TILE_WIDTH,
      coordinateRate: 100,
      coordinateScaleBase: 850,
      sourceUrls: {
        echoCatalogue: 'https://wiki.kurobbs.com/mc/catalogue/list?fid=1099&sid=1107',
        sonataCatalogue: 'https://wiki.kurobbs.com/mc/catalogue/list?fid=1099&sid=1219',
        officialMap: 'https://www.kurobbs.com/mc/map/',
      },
    },
    report,
    sonatas: wiki.sonatas,
    echoes: wiki.echoes,
    states,
    regionLabels: flattenRegions(countryData),
    echoLocations: normalizedEchoLocations,
    navigationPointGroups: navigationGrouping.groups,
    navigationPoints: normalizedNavigationPoints,
    connectors: manual.connectors,
  }

  mapDatasetSchema.parse(dataset)
  await Promise.all([
    writeJson(projectPath('public', 'data', 'app-data.json'), dataset),
    writeJson(projectPath('data', 'generated', 'sync-report.json'), report),
  ])
  console.log(`地图同步完成：${dataset.states.length} 张地图，${dataset.echoLocations.length} 个声骸点，${dataset.navigationPoints.length} 个定位点`)
  console.log(`可参与路线的示例/实测点：${report.routeEligibleEchoLocationCount}；待补 XYZ：${report.provisionalEchoLocationCount}`)
  console.log(`可作为路线起点的定位点：${report.routeEligibleNavigationPointCount}`)
  return dataset
}

if (isMainModule(import.meta.url)) {
  await syncMap()
}
