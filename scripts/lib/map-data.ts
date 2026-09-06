import { createHash } from 'node:crypto'
import { mapCatalogDataSchema, mapDataSchema, mapDatasetSchema, mapPointLocationsSchema } from '../../src/domain/schema.ts'
import { assembleMapDataset } from '../../src/domain/map-data.ts'
import { parsePointLibrary } from '../../src/domain/point-library.ts'
import type { MapCatalogData, MapData, MapDataset, MapPointLocations, OfficialPointData, PointIconDefinition, PointLibrary, PointLocationBase, PointWithIconReference } from '../../src/domain/types.ts'
import { projectPath, readJson, writeJson } from './files.ts'
import { readOfficialPointLibrary } from './official-point-library.ts'

let pendingPublicWrite: Promise<unknown> = Promise.resolve()

export function splitMapDataset(dataset: MapDataset): { map: MapData, catalog: MapCatalogData, locations: MapPointLocations } {
  const { echoLocations, navigationPoints, sonatas, echoes, navigationPointGroups, report, source, ...structure } = dataset
  const { wikiFetchedAt, sourceUrls: { echoCatalogue, sonataCatalogue, officialMap }, ...mapSource } = source
  const icons = new Map<string, PointIconDefinition>()
  function extractIcon<T extends PointLocationBase>(point: T): PointWithIconReference<T> {
    const { typeId, typeName, iconUrl, ...location } = point
    const iconId = createHash('sha256').update(JSON.stringify([typeId, typeName, iconUrl])).digest('hex')
    icons.set(iconId, { id: iconId, typeId, typeName, iconUrl })
    return { ...location, iconId }
  }
  const locations = {
    echoLocations: echoLocations.map(({ iconUrl: _iconUrl, ...location }) => location),
    navigationPoints: navigationPoints.map(extractIcon),
  }
  return {
    map: { ...structure, source: { ...mapSource, sourceUrls: { officialMap } } },
    catalog: {
      source: { wikiFetchedAt, sourceUrls: { echoCatalogue, sonataCatalogue } },
      report, sonatas, echoes, navigationPointGroups, pointIcons: [...icons.values()].sort((left, right) => left.id.localeCompare(right.id)),
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

export async function readOfficialPointData(dataset: MapDataset): Promise<OfficialPointData> {
  return {
    locations: splitMapDataset(dataset).locations,
    library: await readOfficialPointLibrary(projectPath('data', 'generated', 'official-points.json'), dataset),
  }
}

export function writePublicPointData(dataset?: MapDataset): Promise<{ official: OfficialPointData, manual: PointLibrary }> {
  const work = pendingPublicWrite.then(async () => {
    const reference = dataset ?? await readMapDataset()
    const official = await readOfficialPointData(reference)
    const library = parsePointLibrary(await readJson<unknown>(projectPath('data', 'manual', 'points.json')), reference, 'manual')
    const manual = { ...library, points: library.points.filter(({ status }) => status === 'verified') }
    const options = { compact: true, skipUnchanged: true }
    await writeJson(projectPath('public', 'data', 'official-points.json'), official, options)
    await writeJson(projectPath('public', 'data', 'custom-points.json'), manual, options)
    return { official, manual }
  })
  pendingPublicWrite = work.catch(() => undefined)
  return work
}
