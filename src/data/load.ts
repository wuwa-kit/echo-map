import { mapDatasetSchema } from '../domain/schema.ts'
import type { MapDataset } from '../domain/types.ts'
import { emptyPointLibrary, parsePointLibrary } from '../domain/point-library.ts'

export async function loadMapDataset(): Promise<MapDataset> {
  const response = await fetch('/data/app-data.json')
  if (!response.ok) {
    throw new Error(`地图数据加载失败：${response.status} ${response.statusText}`)
  }

  return mapDatasetSchema.parse(await response.json()) as MapDataset
}

export async function loadPointLibrary(dataset: MapDataset) {
  const response = await fetch('/data/points.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`人工点位加载失败：${response.status}`)
  return parsePointLibrary(await response.json(), dataset, 'manual')
}

export async function loadOfficialPointLibrary(dataset: MapDataset) {
  const response = await fetch('/data/official-points.json', { cache: 'no-store' })
  if (response.status === 404) return emptyPointLibrary()
  if (!response.ok) throw new Error(`官方点位加载失败：${response.status}`)
  return parsePointLibrary(await response.json(), dataset, 'official')
}
