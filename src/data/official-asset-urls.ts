import overridesData from '../../data/config/map-tile-overrides.json' with { type: 'json' }
import type { MapTileOverrides } from '../domain/types.ts'

export const mapTileOverrides: MapTileOverrides = overridesData

const TILE_ROOT = 'https://web-static.kurobbs.com/mcmap/tiles'

export function officialTileUrl(resourceHash: string, stateId: number, tileId: string): string {
  const replacement = mapTileOverrides[tileId]
  if (replacement && tileId.startsWith(`${stateId}_`)) return replacement.url
  return `${TILE_ROOT}/${resourceHash}/${stateId}/${tileId}.png`
}

export function officialFloorTileUrl(resourceHash: string, stateId: number, tilePath: string): string {
  return `${TILE_ROOT}/${resourceHash}/${stateId}${tilePath}`
}

export function tilePreviewUrl(url: string, width: number): string {
  if (Object.values(mapTileOverrides).some(entry => entry.url === url)) return url
  return `${url}?x-oss-process=image/format,webp/resize,w_${width},h_${width}`
}
