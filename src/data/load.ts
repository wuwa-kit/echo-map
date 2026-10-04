import { officialMapAssetCatalogSchema } from '../domain/schema.ts'
import { echoPointLibrarySchema, mapCatalogDataSchema, mapDataSchema, navigationPointLibrarySchema, officialEchoPointDataSchema } from '../domain/schema.ts'
import { assembleMapDataset } from '../domain/map-data.ts'
import type { MapDataset, OfficialEchoPointData, PointLibrary } from '../domain/types.ts'
import { combinePointLibraryKinds, emptyPointLibrary, parsePointLibrary } from '../domain/point-library.ts'
import { readBrowserPointSnapshot, synchronizeBrowserPoints } from './browser-point-repository.ts'
import { parsePointWorkspace, workspaceLibrary } from '../domain/local-points.ts'

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

export async function loadMapDataset(): Promise<{ dataset: MapDataset, officialLibrary: PointLibrary }> {
  const [map, catalog, officialEcho] = await Promise.all([
    loadMapData(), loadMapCatalogData(), loadOfficialEchoPointData(),
  ])
  const dataset = assembleMapDataset(map, catalog, {
    echoLocations: officialEcho.locations,
  })
  return { dataset, officialLibrary: parsePointLibrary(officialEcho.library, dataset, 'official') }
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
  const published = parsePointLibrary(library, dataset, 'manual')
  if (import.meta.env.PROD && typeof indexedDB !== 'undefined') {
    const current = await readBrowserPointSnapshot()
    if (current) {
      const snapshot = await synchronizeBrowserPoints(published, current)
      return snapshot.workspace ? workspaceLibrary(parsePointWorkspace(snapshot.workspace, dataset)) : snapshot.library
    }
  }
  return published
}

export async function loadMapAssetCatalog() {
  const response = await fetch('/data/map-asset-catalog.json')
  if (!response.ok) throw new Error(`地图资产目录加载失败：${response.status}`)
  return officialMapAssetCatalogSchema.parse(await response.json())
}
