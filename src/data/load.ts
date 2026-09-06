import { mapCatalogDataSchema, mapDataSchema, officialPointDataSchema } from '../domain/schema.ts'
import { assembleMapDataset } from '../domain/map-data.ts'
import type { MapDataset, OfficialPointData, PointLibrary } from '../domain/types.ts'
import { emptyPointLibrary, parsePointLibrary } from '../domain/point-library.ts'

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

async function loadOfficialPointData(): Promise<OfficialPointData> {
  const response = await fetch('/data/official-points.json', { cache: 'no-store' })
  if (response.status === 404) return { locations: { echoLocations: [], navigationPoints: [] }, library: emptyPointLibrary() }
  if (!response.ok) throw new Error(`官方点位加载失败：${response.status}`)
  return officialPointDataSchema.parse(await response.json())
}

export async function loadMapDataset(): Promise<{ dataset: MapDataset, officialLibrary: PointLibrary }> {
  const [map, catalog, official] = await Promise.all([loadMapData(), loadMapCatalogData(), loadOfficialPointData()])
  const dataset = assembleMapDataset(map, catalog, official.locations)
  return { dataset, officialLibrary: parsePointLibrary(official.library, dataset, 'official') }
}

export async function loadPointLibrary(dataset: MapDataset) {
  const response = await fetch('/data/custom-points.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`人工点位加载失败：${response.status}`)
  return parsePointLibrary(await response.json(), dataset, 'manual')
}
