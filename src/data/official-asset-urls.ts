const TILE_ROOT = 'https://web-static.kurobbs.com/mcmap/tiles'

export function officialTileUrl(resourceHash: string, stateId: number, tileId: string): string {
  return `${TILE_ROOT}/${resourceHash}/${stateId}/${tileId}.png`
}

export function officialFloorTileUrl(resourceHash: string, stateId: number, tilePath: string): string {
  return `${TILE_ROOT}/${resourceHash}/${stateId}${tilePath}`
}

export function tilePreviewUrl(url: string, width: number): string {
  return `${url}?x-oss-process=image/format,webp/resize,w_${width},h_${width}`
}
