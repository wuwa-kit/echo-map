import { fetchPublishedData } from './fetch-published-data.ts'
import { officialMapAssetCatalogSchema } from '../domain/schema.ts'
import { echoPointLibrarySchema, mapCatalogDataSchema, mapDataSchema, navigationPointLibrarySchema, officialEchoPointDataSchema } from '../domain/schema.ts'
import { assembleMapDataset } from '../domain/map-data.ts'
import type { MapDataset, OfficialEchoPointData, PointLibrary } from '../domain/types.ts'
import { combinePointLibraryKinds, emptyPointLibrary, parsePointLibrary } from '../domain/point-library.ts'
import { refreshBrowserPointSnapshot } from './browser-point-repository.ts'
import { parsePointWorkspace, workspaceLibrary } from '../domain/local-points.ts'

async function loadMapData() {
  return mapDataSchema.parse(await fetchPublishedData('map-data.json'))
}

async function loadMapCatalogData() {
  return mapCatalogDataSchema.parse(await fetchPublishedData('catalog-data.json'))
}

async function loadOfficialEchoPointData(): Promise<OfficialEchoPointData> {
  const data = await fetchPublishedData('official-echo-points.json', () => ({ locations: [], library: emptyPointLibrary() }))
  return officialEchoPointDataSchema.parse(data)
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
  const [echo, navigation] = await Promise.all([
    fetchPublishedData('custom-echo-points.json'),
    fetchPublishedData('custom-navigation-points.json'),
  ])
  const library = combinePointLibraryKinds(
    echoPointLibrarySchema.parse(echo),
    navigationPointLibrarySchema.parse(navigation),
  )
  const published = parsePointLibrary(library, dataset, 'manual')
  if (import.meta.env.PROD && typeof indexedDB !== 'undefined') {
    const snapshot = await refreshBrowserPointSnapshot(published)
    if (snapshot) {
      return snapshot.workspace ? workspaceLibrary(parsePointWorkspace(snapshot.workspace, dataset)) : snapshot.library
    }
  }
  return published
}

export async function loadMapAssetCatalog() {
  return officialMapAssetCatalogSchema.parse(await fetchPublishedData('map-asset-catalog.json'))
}
