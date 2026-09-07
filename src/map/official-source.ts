import TileLayer from 'ol/layer/Tile.js'
import TileImage from 'ol/source/TileImage.js'
import TileGrid from 'ol/tilegrid/TileGrid.js'
import type { GravityType, MapStateDefinition, SourceManifest } from '../domain/types.ts'
import { officialFloorTileUrl, officialTileUrl, tilePreviewUrl } from '../data/official-asset-urls.ts'

export function createOfficialTileLayer(state: MapStateDefinition, sourceManifest: SourceManifest, gravity: GravityType = 1, cacheSize?: number): TileLayer<TileImage> {
  const { tileExtent } = state
  const availableTiles = new Set(state.tileIds)
  const gravityTiles = new Set(state.gravityTiles)
  const tileGrid = new TileGrid({
    extent: tileExtent.extent,
    origin: [tileExtent.extent[0], tileExtent.extent[3]],
    resolutions: [1],
    tileSize: sourceManifest.tileWidth,
  })
  const source = new TileImage({
    attributions: '地图资源 © 库街区官方地图',
    crossOrigin: 'anonymous',
    interpolate: true,
    projection: 'KURO:CRS-SIMPLE',
    tileGrid,
    tileUrlFunction(tileCoordinate) {
      if (!tileCoordinate) {
        return undefined
      }
      const tileX = tileCoordinate[1]
      const tileY = tileCoordinate[2]
      if (tileX === undefined || tileY === undefined) {
        return undefined
      }
      const officialX = tileExtent.minTileX + tileX
      const officialY = tileExtent.maxTileY - tileY
      const tileId = `${state.id}_${officialX}_${officialY}`
      if (gravity === 2) {
        const path = `/2/${officialX}_${officialY}.png`
        return gravityTiles.has(path) ? tilePreviewUrl(officialFloorTileUrl(sourceManifest.mapResourceHash, state.id, path), sourceManifest.tileWidth) : undefined
      }
      if (!availableTiles.has(tileId)) {
        return undefined
      }
      return tilePreviewUrl(officialTileUrl(sourceManifest.mapResourceHash, state.id, tileId), sourceManifest.tileWidth)
    },
  })

  return new TileLayer({
    source,
    // This source has one resolution, so there is no coarser level to preload.
    preload: 0,
    cacheSize,
  })
}

export function layeredTileUrl(resourceHash: string, stateId: number, tilePath: string): string {
  return tilePreviewUrl(officialFloorTileUrl(resourceHash, stateId, tilePath), 1024)
}
