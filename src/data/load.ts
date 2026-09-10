import { echoPointLibrarySchema, mapCatalogDataSchema, mapDataSchema, navigationPointLibrarySchema, officialEchoPointDataSchema, officialNavigationPointDataSchema } from '../domain/schema.ts'
import { assembleMapDataset } from '../domain/map-data.ts'
import type { MapDataset, OfficialEchoPointData, OfficialNavigationPointData, PointLibrary } from '../domain/types.ts'
import { combinePointLibraryKinds, emptyPointLibrary, parsePointLibrary } from '../domain/point-library.ts'

async function loadMapData() {
  const response = await fetch('/data/map-data.json')
  if (!response.ok) {
    throw new Error(`地图数据加载失败：${response.status} ${response.statusText}`)
  }

  return mapDataSchema.parse(await response.json())
}

async function loadMapCatalogData() {
  const response = await fetch('/data/catalog-data.json')
  if (!response.ok) throw new Error(`图鉴与图标数据加载失败：${response.status}`)
  return mapCatalogDataSchema.parse(await response.json())
}

async function loadOfficialEchoPointData(): Promise<OfficialEchoPointData> {
  const response = await fetch('/data/official-echo-points.json', { cache: 'no-store' })
  if (response.status === 404) return { locations: [], library: emptyPointLibrary() }
  if (!response.ok) throw new Error(`官方声骸点位加载失败：${response.status}`)
  return officialEchoPointDataSchema.parse(await response.json())
}

async function loadOfficialNavigationPointData(): Promise<OfficialNavigationPointData> {
  const response = await fetch('/data/official-navigation-points.json', { cache: 'no-store' })
  if (response.status === 404) return { locations: [], library: emptyPointLibrary() }
  if (!response.ok) throw new Error(`官方定位点加载失败：${response.status}`)
  return officialNavigationPointDataSchema.parse(await response.json())
}

export async function loadMapDataset(): Promise<{ dataset: MapDataset, officialLibrary: PointLibrary }> {
  const [map, catalog, officialEcho, officialNavigation] = await Promise.all([
    loadMapData(), loadMapCatalogData(), loadOfficialEchoPointData(), loadOfficialNavigationPointData(),
  ])
  const dataset = assembleMapDataset(map, catalog, {
    echoLocations: officialEcho.locations,
    navigationPoints: officialNavigation.locations,
  })
  const officialLibrary = combinePointLibraryKinds(officialEcho.library, officialNavigation.library)
  return { dataset, officialLibrary: parsePointLibrary(officialLibrary, dataset, 'official') }
}

export async function loadPointLibrary(dataset: MapDataset) {
  const [echoResponse, navigationResponse] = await Promise.all([
    fetch('/data/custom-echo-points.json', { cache: 'no-store' }),
    fetch('/data/custom-navigation-points.json', { cache: 'no-store' }),
  ])
  if (!echoResponse.ok) throw new Error(`人工声骸点位加载失败：${echoResponse.status}`)
  if (!navigationResponse.ok) throw new Error(`人工定位点加载失败：${navigationResponse.status}`)
  const library = combinePointLibraryKinds(
    echoPointLibrarySchema.parse(await echoResponse.json()),
    navigationPointLibrarySchema.parse(await navigationResponse.json()),
  )
  return parsePointLibrary(library, dataset, 'manual')
}
