import { readPointLibrary } from './lib/point-files.ts'
import { isOfficialEchoMapIncluded } from '../src/domain/official-echo-scope.ts'
import { officialMapAssetCatalogSchema } from '../src/domain/schema.ts'
import { mapZoomRangeSchema, officialAssetSchema, officialEchoPointDataSchema, wikiCatalogueSchema } from '../src/domain/schema.ts'
import { navigationIconById } from '../src/domain/navigation-icons.ts'
import { navigationIconCatalog } from '../src/domain/navigation-icon-catalog.ts'
import { mapDisplayTierSchema, navigationIconDefinitionSchema } from '../src/domain/schema.ts'
import { navigationPointTypeIds, navigationPointTypes } from '../src/domain/navigation-point-types.ts'
import { officialNavigationTypeIds } from './lib/map/navigation-types.ts'
import { buildOfficialAssets } from '../src/domain/official-assets.ts'
import { MAP_POINT_ZOOM_RANGES, MAP_TIER_ZOOM_RANGES, mapPointZoomRange } from '../src/map/point-visibility.ts'
import { projectPath, readJson } from './lib/files.ts'
import { parsePointLibrary, splitPointLibrary } from '../src/domain/point-library.ts'
import { changeOperation, changeStatus, parsePointWorkspace } from '../src/domain/local-points.ts'
import { localPointOperationSchema, localPointStatusSchema } from '../src/domain/schema.ts'
import { readMapDataset, readOfficialPointData } from './lib/map-data.ts'
import { inferOfficialEchoCountryId, OFFICIAL_ECHO_MERGE_DIAMETER } from './lib/official-point-library.ts'

const dataset = await readMapDataset()
wikiCatalogueSchema.parse(await readJson<unknown>(projectPath('data', 'generated', 'wiki.json')))
const mapAssets = officialMapAssetCatalogSchema.parse(await readJson<unknown>(projectPath('public', 'data', 'map-asset-catalog.json')))
const assets = buildOfficialAssets(dataset, mapAssets.assets)
const assetIds = new Set<string>()
for (const asset of assets) {
  officialAssetSchema.parse(asset)
  if (assetIds.has(asset.id)) throw new Error(`重复资产 ID：${asset.id}`)
  assetIds.add(asset.id)
  if (asset.stateIds.some((id) => !dataset.states.some((state) => state.id === id))) {
    throw new Error(`资产 ${asset.name} 引用了不存在的地图`)
  }
}
const pointLibrary = await readPointLibrary(projectPath('data', 'manual'), dataset, 'manual')
parsePointWorkspace({ version: 1, published: pointLibrary, changes: [] }, dataset)
for (const point of pointLibrary.points) {
  const change = { id: point.id, before: null, after: point, needsReview: false }
  localPointOperationSchema.parse(changeOperation(change))
  localPointStatusSchema.parse(changeStatus(change, point))
}
const manual = splitPointLibrary(pointLibrary)
const official = await readOfficialPointData(dataset)
const officialEcho = officialEchoPointDataSchema.parse(official.echo)
const officialLibrary = parsePointLibrary(officialEcho.library, dataset, 'official')
const echoIds = new Set(dataset.echoes.map(({ id }) => id))
const sonataIds = new Set(dataset.sonatas.map(({ id }) => id))
const errors: string[] = []
const classifiedTypeIds = Object.values(officialNavigationTypeIds).flat()
if (new Set(classifiedTypeIds).size !== classifiedTypeIds.length) errors.push('同一官方类型 ID 不能属于多个定位点类型')
const localIconIds = new Set<string>()
for (const icon of navigationIconCatalog) {
  navigationIconDefinitionSchema.parse(icon)
  if (localIconIds.has(icon.id)) errors.push(`重复定位点图标 ID：${icon.id}`)
  localIconIds.add(icon.id)
}
for (const type of navigationPointTypeIds) {
  const rule = navigationPointTypes[type]
  mapDisplayTierSchema.parse(rule.displayTier)
  if (new Set(rule.icons).size !== rule.icons.length) errors.push(`${rule.name} 的图标列表有重复项`)
  if (rule.names.length > 1 || rule.names.some((name) => !name.trim())) errors.push(`${rule.name} 的名称只能为空列表或单个固定名称`)
  if (rule.icons.some((id) => !navigationIconById(id))) errors.push(`${rule.name} 的图标列表引用了未知图标`)
  if (new Set(rule.icons.map((id) => navigationIconById(id)?.url)).size !== rule.icons.length) errors.push(`${rule.name} 的图标列表包含重复图像`)
}

for (const state of dataset.states) {
  for (const group of state.layeredMaps) {
    const tiles = new Set(group.floors.flatMap(({ tiles }) => tiles.map((tile) => tile.split('/').at(-1))))
    if (group.coverage.length !== tiles.size) errors.push(`楼层组 ${state.id}/${group.id} 缺少覆盖数据，请重新生成楼层覆盖范围`)
  }
}

for (const range of [...Object.values(MAP_POINT_ZOOM_RANGES), ...Object.values(MAP_TIER_ZOOM_RANGES)]) mapZoomRangeSchema.parse(range)
const officialById = new Map(dataset.echoLocations.map((point) => [point.id, point]))
const officialEchoById = new Map(dataset.echoLocations.map((point) => [point.id, point]))
const convertedOfficialIds = new Set<string>()
for (const point of officialLibrary.points) {
  if (point.note !== undefined || (point.kind === 'echo' && point.compositionStatus === 'partial')) {
    errors.push(`官方点 ${point.id} 包含可省略的备注或默认清单状态，请重新转换官方点位`)
  }
  const officialIds = point.officialIds ?? []
  const expectedPointId = `official:${[...officialIds].sort((left, right) => left.localeCompare(right))[0]}`
  if (point.id !== expectedPointId) errors.push(`官方点 ${point.id} 未使用最小来源 ID 生成稳定 ID`)
  for (const id of officialIds) {
    if (convertedOfficialIds.has(id)) errors.push(`官方来源 ${id} 被多个转换点重复引用`)
    convertedOfficialIds.add(id)
    const original = officialById.get(id)
    if (!original || original.gravityType !== point.gravityType) errors.push(`官方点 ${point.id} 的重力与来源 ${id} 不一致，请重新转换官方点位`)
  }
  if (point.kind !== 'echo') {
    errors.push(`官方点位库只允许声骸点：${point.id}`)
    continue
  }

  const sources = officialIds.flatMap((id) => {
    const source = officialEchoById.get(id)
    return source ? [source] : []
  })
  if (sources.length !== officialIds.length) {
    errors.push(`官方声骸点 ${point.id} 引用了非声骸来源`)
    continue
  }
  const firstSource = sources[0]
  if (!firstSource) continue
  const firstCountryId = inferOfficialEchoCountryId(firstSource, dataset)
  const maximumRawDistanceSquared = (OFFICIAL_ECHO_MERGE_DIAMETER * 100) ** 2
  for (let leftIndex = 0; leftIndex < sources.length; leftIndex += 1) {
    const left = sources[leftIndex]
    if (!left) continue
    if (
      left.stateId !== firstSource.stateId
      || inferOfficialEchoCountryId(left, dataset) !== firstCountryId
      || left.levelId !== firstSource.levelId
      || left.gravityType !== firstSource.gravityType
    ) {
      errors.push(`官方声骸点 ${point.id} 合并了不同地图、地区、楼层或重力的来源`)
      break
    }
    for (let rightIndex = leftIndex + 1; rightIndex < sources.length; rightIndex += 1) {
      const right = sources[rightIndex]
      if (!right) continue
      const x = left.coordinate.rawX - right.coordinate.rawX
      const y = left.coordinate.rawY - right.coordinate.rawY
      if (x * x + y * y > maximumRawDistanceSquared) {
        errors.push(`官方声骸点 ${point.id} 的来源直径超过 ${OFFICIAL_ECHO_MERGE_DIAMETER}`)
        break
      }
    }
  }
  if (!sources.some((source) => (
    Math.round(source.coordinate.rawX / 100) === point.coordinate.x
    && Math.round(source.coordinate.rawY / 100) === point.coordinate.y
  ))) {
    errors.push(`官方声骸点 ${point.id} 未使用真实来源点作为代表坐标`)
  }
  const expectedMembers = new Map<string, number>()
  for (const source of sources) expectedMembers.set(source.echoId, (expectedMembers.get(source.echoId) ?? 0) + 1)
  const actualMembers = new Map(point.members.map(({ echoId, count }) => [echoId, count]))
  if (
    expectedMembers.size !== actualMembers.size
    || [...expectedMembers].some(([echoId, count]) => actualMembers.get(echoId) !== count)
  ) {
    errors.push(`官方声骸点 ${point.id} 的声骸数量未按每个来源点 1 只汇总`)
  }
}
for (const id of officialById.keys()) {
  if (!convertedOfficialIds.has(id)) errors.push(`官方来源 ${id} 未转换到点位库`)
}
for (const label of dataset.regionLabels) {
  const range = mapPointZoomRange({ category: 'region-name', location: label })
  if (range) mapZoomRangeSchema.parse(range)
  if (!dataset.states.some(({ id }) => id === label.stateId)) {
    errors.push(`文字定位点 ${label.name} 引用了不存在的地图 ${label.stateId}`)
  }
}

for (const echo of dataset.echoes) {
  if (echo.cost !== 1 && echo.cost !== 3) {
    errors.push(`${echo.name} 不是 C1/C3 声骸`)
  }
  if (echo.sonataIds.length === 0) {
    errors.push(`${echo.name} 没有合鸣套装`)
  }
  for (const sonataId of echo.sonataIds) {
    if (!sonataIds.has(sonataId)) {
      errors.push(`${echo.name} 引用了不存在的合鸣效果 ${sonataId}`)
    }
  }
}

if (dataset.navigationPoints.length || dataset.navigationPointGroups.length) errors.push('官方数据不应包含定位点或定位点分组')

for (const location of dataset.echoLocations) {
  if (!isOfficialEchoMapIncluded(dataset, location.stateId, [location.coordinate.mapX, location.coordinate.mapY])) {
    errors.push(`官方来源 ${location.id} 不在收录地图范围内`)
  }
  if (!echoIds.has(location.echoId)) {
    errors.push(`点位 ${location.id} 引用了白名单外声骸 ${location.echoId}`)
  }
  if (location.iconUrl !== dataset.echoes.find(({ id }) => id === location.echoId)?.iconUrl) {
    errors.push(`声骸点位 ${location.id} 必须使用图鉴头像`)
  }
}

for (const collection of [dataset.echoLocations, dataset.navigationPoints, dataset.regionLabels]) {
  const ids = new Set<string>()
  for (const location of collection) {
    if (ids.has(location.id)) {
      errors.push(`同类点位存在重复 ID：${location.id}`)
    }
    ids.add(location.id)
  }
}

if (errors.length > 0) {
  throw new Error(`数据校验失败：\n${errors.join('\n')}`)
}

console.log([
  '数据校验通过',
  `官方资产 ${assets.length}`,
  `反重力瓦片 ${dataset.states.reduce((sum, state) => sum + state.gravityTiles.length, 0)}`,
  `地图导航 ${dataset.mapNavigation.length} 个大区 / ${dataset.mapNavigation.reduce((sum, country) => sum + country.groups.length, 0)} 个分组`,
  `人工点位 ${pointLibrary.points.length}（声骸 ${manual.echo.points.length} / 定位点 ${manual.navigation.points.length}）`,
  `官方声骸点位 ${officialLibrary.points.length}`,
  `声骸 ${dataset.echoes.length}`,
  `合鸣效果 ${dataset.sonatas.length}`,
  `声骸点位 ${dataset.echoLocations.length}`,
  `定位点 ${dataset.navigationPoints.length}`,
  `文字定位点 ${dataset.regionLabels.length}`,
  `图标分组 ${dataset.navigationPointGroups.length}`,
  `已分类定位点 ${pointLibrary.points.filter((point) => point.kind === 'navigation' && point.pointType).length}`,
  `自选图标点位 ${pointLibrary.points.filter((point) => point.kind === 'navigation' && (point.iconId || point.iconUrl)).length}`,
  `路线可用声骸点 ${dataset.report.routeEligibleEchoLocationCount}`,
].join(' · '))
