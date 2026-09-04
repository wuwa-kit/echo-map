import { mapDatasetSchema } from '../domain/schema.ts'
import type { MapDataset } from '../domain/types.ts'

export async function loadMapDataset(): Promise<MapDataset> {
  const response = await fetch('/data/app-data.json')
  if (!response.ok) {
    throw new Error(`地图数据加载失败：${response.status} ${response.statusText}`)
  }

  return mapDatasetSchema.parse(await response.json()) as MapDataset
}
