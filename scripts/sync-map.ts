import { mapDatasetSchema } from '../src/domain/schema.ts'
import type { MapDataset, MapStateDefinition } from '../src/domain/types.ts'
import { calculateTileExtent } from '../src/map/projection.ts'
import { isMainModule, projectPath, readJson, writeJson } from './lib/files.ts'
import { writeMapDataset } from './lib/map-data.ts'
import type { WikiSnapshot } from './lib/wiki.ts'
import { flattenRegions, normalizeLayers, normalizeMapNavigation, normalizeGravityTiles } from './lib/map/normalize.ts'
import { normalizeLocations } from './lib/map/locations.ts'
import { groupNavigationPoints } from './lib/map/navigation-groups.ts'
import { fetchCountryData, fetchMapConfiguration, fetchNavigationIconHashes, fetchStatePayloads } from './lib/map/source.ts'
import type { AliasData, ManualData, NavigationConfig, NavigationGroupConfig } from './lib/map/types.ts'

const TILE_WIDTH = 1024

export async function syncMap(wikiInput?: WikiSnapshot): Promise<MapDataset> {
  const wiki = wikiInput ?? await readJson<WikiSnapshot>(projectPath('data', 'generated', 'wiki.json'))
  const manual = await readJson<ManualData>(projectPath('data', 'manual', 'locations.json'))
  const aliases = await readJson<AliasData>(projectPath('data', 'config', 'map-echo-aliases.json'))
  const navigationConfig = await readJson<NavigationConfig>(projectPath('data', 'config', 'map-navigation-types.json'))
  const navigationGroupConfig = await readJson<NavigationGroupConfig>(projectPath('data', 'config', 'map-navigation-icon-groups.json'))
  const mapFetchedAt = new Date().toISOString()
  console.log('正在抓取官方地图资源清单、分层和点位…')
  const configuration = await fetchMapConfiguration()
  const countryData = await fetchCountryData(configuration.resourceHash)
  const statePayloads = await fetchStatePayloads(configuration)
  const states: MapStateDefinition[] = statePayloads.map(({ state, layerData, gravityData }) => {
    const tileIds = configuration.tileIdsByState[String(state.id)] ?? []
    return {
      id: state.id,
      name: state.name,
      tileIds,
      gravityTiles: normalizeGravityTiles(gravityData),
      tileExtent: calculateTileExtent(tileIds),
      layeredMaps: normalizeLayers(layerData),
    }
  })

  const locations = normalizeLocations(wiki, manual, aliases, navigationConfig, statePayloads)
  const { exactMatchedEchoIds, aliasMatchedEchoIds } = locations
  const matchedEchoIds = new Set([...exactMatchedEchoIds, ...aliasMatchedEchoIds])
  const normalizedEchoLocations = locations.echoLocations
  console.log('正在按图标内容整理定位点显示分组…')
  const iconHashes = await fetchNavigationIconHashes(locations.navigationPoints)
  const navigationGrouping = groupNavigationPoints(locations.navigationPoints, navigationGroupConfig, iconHashes)
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
    mapNavigation: normalizeMapNavigation(countryData),
    regionLabels: flattenRegions(countryData),
    echoLocations: normalizedEchoLocations,
    navigationPointGroups: navigationGrouping.groups,
    navigationPoints: normalizedNavigationPoints,
    connectors: manual.connectors,
  }

  mapDatasetSchema.parse(dataset)
  await Promise.all([
    writeMapDataset(dataset),
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
