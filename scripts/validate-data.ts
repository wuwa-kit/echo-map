import { mapDatasetSchema } from '../src/domain/schema.ts'
import type { MapDataset } from '../src/domain/types.ts'
import { projectPath, readJson } from './lib/files.ts'

const rawDataset = await readJson<unknown>(projectPath('public', 'data', 'app-data.json'))
const dataset = mapDatasetSchema.parse(rawDataset) as MapDataset
const echoIds = new Set(dataset.echoes.map(({ id }) => id))
const sonataIds = new Set(dataset.sonatas.map(({ id }) => id))
const errors: string[] = []

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
}

for (const collection of [dataset.echoLocations, dataset.navigationPoints]) {
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
  `声骸 ${dataset.echoes.length}`,
  `合鸣效果 ${dataset.sonatas.length}`,
  `声骸点位 ${dataset.echoLocations.length}`,
  `定位点 ${dataset.navigationPoints.length}`,
  `图标分组 ${dataset.navigationPointGroups.length}`,
  `BOSS ${dataset.report.bossNavigationPointCount}`,
  `挑战 ${dataset.report.challengeNavigationPointCount}`,
  `路线起点 ${routeEligibleNavigationPoints.length}`,
  `路线可用声骸点 ${dataset.report.routeEligibleEchoLocationCount}`,
].join(' · '))
