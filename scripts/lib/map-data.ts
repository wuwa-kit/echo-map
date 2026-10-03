import { readPointLibrary } from './point-files.ts'
import { selectOfficialEchoLocations } from '../../src/domain/official-echo-scope.ts'
import { mapCatalogDataSchema, mapDataSchema, mapDatasetSchema, mapPointLocationsSchema } from '../../src/domain/schema.ts'
import { assembleMapDataset } from '../../src/domain/map-data.ts'
import { splitPointLibrary } from '../../src/domain/point-library.ts'
import type { MapCatalogData, MapData, MapDataset, MapPointLocations, OfficialEchoPointData, PointLibrary } from '../../src/domain/types.ts'
import { projectPath, readJson, writeJson } from './files.ts'
import { readOfficialPointLibrary } from './official-point-library.ts'

let pendingPublicWrite: Promise<unknown> = Promise.resolve()

export function splitMapDataset(dataset: MapDataset): { map: MapData, catalog: MapCatalogData, locations: MapPointLocations } {
  const { echoLocations: _echoLocations, navigationPoints: _navigationPoints, sonatas, echoes, navigationPointGroups: _navigationPointGroups, report, source, ...structure } = dataset
  const { wikiFetchedAt, sourceUrls: { echoCatalogue, sonataCatalogue, officialMap }, ...mapSource } = source
  const locations = {
    echoLocations: selectOfficialEchoLocations(dataset).map(({ iconUrl: _iconUrl, ...location }) => location),
  }
  return {
    map: { ...structure, source: { ...mapSource, sourceUrls: { officialMap } } },
    catalog: {
      source: { wikiFetchedAt, sourceUrls: { echoCatalogue, sonataCatalogue } },
      report, sonatas, echoes,
    },
    locations,
  }
}

export async function readMapDataset(): Promise<MapDataset> {
  const [map, catalog, locations] = await Promise.all([
    readJson<unknown>(projectPath('public', 'data', 'map-data.json')),
    readJson<unknown>(projectPath('public', 'data', 'catalog-data.json')),
    readJson<unknown>(projectPath('data', 'generated', 'official-locations.json')),
  ])
  return assembleMapDataset(mapDataSchema.parse(map), mapCatalogDataSchema.parse(catalog), mapPointLocationsSchema.parse(locations))
}

export async function writeMapDataset(dataset: MapDataset): Promise<void> {
  mapDatasetSchema.parse(dataset)
  const { map, catalog, locations } = splitMapDataset(dataset)
  await writeJson(projectPath('public', 'data', 'map-data.json'), map, { compact: true })
  await writeJson(projectPath('public', 'data', 'catalog-data.json'), catalog, { compact: true })
  await writeJson(projectPath('data', 'generated', 'official-locations.json'), locations, { compact: true })
  await writePublicPointData(dataset)
}

export async function readOfficialPointData(dataset: MapDataset): Promise<{
  echo: OfficialEchoPointData
}> {
  const locations = splitMapDataset(dataset).locations
  const library = await readOfficialPointLibrary(projectPath('data', 'generated', 'official-echo'), dataset)
  return {
    echo: { locations: locations.echoLocations, library },
  }
}

export async function readPublicPointData(dataset?: MapDataset): Promise<{
  officialEcho: OfficialEchoPointData
  manualEcho: PointLibrary
  manualNavigation: PointLibrary
}> {
  const reference = dataset ?? await readMapDataset()
  const official = await readOfficialPointData(reference)
  const library = await readPointLibrary(projectPath('data', 'manual'), reference, 'manual')
  const manual = splitPointLibrary(library)
  return { officialEcho: official.echo, manualEcho: manual.echo, manualNavigation: manual.navigation }
}

export function writePublicPointData(dataset?: MapDataset): Promise<void> {
  const work = pendingPublicWrite.then(async () => {
    const data = await readPublicPointData(dataset)
    const options = { compact: true, skipUnchanged: true }
    await writeJson(projectPath('public', 'data', 'official-echo-points.json'), data.officialEcho, options)
    await writeJson(projectPath('public', 'data', 'custom-echo-points.json'), data.manualEcho, options)
    await writeJson(projectPath('public', 'data', 'custom-navigation-points.json'), data.manualNavigation, options)
  })
  pendingPublicWrite = work.catch(() => undefined)
  return work
}
