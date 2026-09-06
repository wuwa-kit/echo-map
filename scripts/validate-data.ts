import { mapZoomRangeSchema, officialAssetSchema, officialPointDataSchema, wikiCatalogueSchema } from '../src/domain/schema.ts'
import { buildOfficialAssets } from '../src/domain/official-assets.ts'
import { MAP_POINT_ZOOM_RANGES, mapPointZoomRange } from '../src/map/point-visibility.ts'
import { projectPath, readJson } from './lib/files.ts'
import { parsePointLibrary } from '../src/domain/point-library.ts'
import { readMapDataset, readOfficialPointData } from './lib/map-data.ts'

const dataset = await readMapDataset()
wikiCatalogueSchema.parse(await readJson<unknown>(projectPath('data', 'generated', 'wiki.json')))
const assets = buildOfficialAssets(dataset)
const assetIds = new Set<string>()
for (const asset of assets) {
  officialAssetSchema.parse(asset)
  if (assetIds.has(asset.id)) throw new Error(`重复资产 ID：${asset.id}`)
  assetIds.add(asset.id)
  if (asset.stateIds.some((id) => !dataset.states.some((state) => state.id === id))) {
    throw new Error(`资产 ${asset.name} 引用了不存在的地图`)
  }
}
const pointLibrary = parsePointLibrary(await readJson<unknown>(projectPath('data', 'manual', 'points.json')), dataset, 'manual')
const { library: officialLibrary } = officialPointDataSchema.parse(await readOfficialPointData(dataset))
const echoIds = new Set(dataset.echoes.map(({ id }) => id))
const sonataIds = new Set(dataset.sonatas.map(({ id }) => id))
const errors: string[] = []

for (const state of dataset.states) {
  for (const group of state.layeredMaps) {
    const tiles = new Set(group.floors.flatMap(({ tiles }) => tiles.map((tile) => tile.split('/').at(-1))))
    if (group.coverage.length !== tiles.size) errors.push(`楼层组 ${state.id}/${group.id} 缺少覆盖数据，请重新生成楼层覆盖范围`)
  }
}

for (const range of Object.values(MAP_POINT_ZOOM_RANGES)) mapZoomRangeSchema.parse(range)
const officialById = new Map([...dataset.echoLocations, ...dataset.navigationPoints].map((point) => [point.id, point]))
for (const point of officialLibrary.points) {
  for (const id of point.officialIds ?? []) {
    const original = officialById.get(id)
    if (!original || original.gravityType !== point.gravityType) errors.push(`官方点 ${point.id} 的重力与来源 ${id} 不一致，请重新转换官方点位`)
  }
}
for (const label of dataset.regionLabels) {
  mapZoomRangeSchema.parse(mapPointZoomRange({ category: 'region-name', location: label }))
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

const navigationGroupIds = new Set<string>()
for (const group of dataset.navigationPointGroups) {
  if (navigationGroupIds.has(group.id)) {
    errors.push(`定位点图标分组存在重复 ID：${group.id}`)
  }
  navigationGroupIds.add(group.id)
}

for (const point of dataset.navigationPoints) {
  if (point.typeName === '观景点') {
    errors.push(`定位点 ${point.id} 不应收录观景点`)
  }
  if (!navigationGroupIds.has(point.groupId)) {
    errors.push(`定位点 ${point.id} 引用了不存在的图标分组 ${point.groupId}`)
  }
  if ((point.kind === 'boss' || point.catalogCategoryName === '挑战') && point.mode !== 'fast-travel') {
    errors.push(`${point.typeName} 应标记为可传送点`)
  }
}

for (const group of dataset.navigationPointGroups) {
  if (group.typeNames.includes('观景点')) {
    errors.push(`定位点图标分组 ${group.id} 不应收录观景点`)
  }
}

for (const location of dataset.echoLocations) {
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

const routeEligibleNavigationPoints = dataset.navigationPoints.filter(({ mode, gameCoordinate }) => (
  mode === 'fast-travel' && gameCoordinate !== null
))
if (routeEligibleNavigationPoints.length !== dataset.report.routeEligibleNavigationPointCount) {
  errors.push('路线起点统计与定位点数据不一致')
}
if (dataset.navigationPoints.length !== dataset.report.navigationPointCount) {
  errors.push('定位点统计与定位点数据不一致')
}
if (dataset.navigationPointGroups.length !== dataset.report.navigationPointGroupCount) {
  errors.push('定位点图标分组统计与数据不一致')
}
if (dataset.navigationPoints.filter(({ kind }) => kind === 'boss').length !== dataset.report.bossNavigationPointCount) {
  errors.push('BOSS 定位点统计与数据不一致')
}
if (dataset.navigationPoints.filter(({ catalogCategoryName }) => catalogCategoryName === '挑战').length !== dataset.report.challengeNavigationPointCount) {
  errors.push('挑战定位点统计与数据不一致')
}

if (errors.length > 0) {
  throw new Error(`数据校验失败：\n${errors.join('\n')}`)
}

console.log([
  '数据校验通过',
  `官方资产 ${assets.length}`,
  `反重力瓦片 ${dataset.states.reduce((sum, state) => sum + state.gravityTiles.length, 0)}`,
  `地图导航 ${dataset.mapNavigation.length} 个大区 / ${dataset.mapNavigation.reduce((sum, country) => sum + country.groups.length, 0)} 个分组`,
  `人工点位 ${pointLibrary.points.length}`,
  `官方录入格式 ${officialLibrary.points.length}`,
  `声骸 ${dataset.echoes.length}`,
  `合鸣效果 ${dataset.sonatas.length}`,
  `声骸点位 ${dataset.echoLocations.length}`,
  `定位点 ${dataset.navigationPoints.length}`,
  `文字定位点 ${dataset.regionLabels.length}`,
  `图标分组 ${dataset.navigationPointGroups.length}`,
  `BOSS ${dataset.report.bossNavigationPointCount}`,
  `挑战 ${dataset.report.challengeNavigationPointCount}`,
  `路线起点 ${routeEligibleNavigationPoints.length}`,
  `路线可用声骸点 ${dataset.report.routeEligibleEchoLocationCount}`,
].join(' · '))
