import TileLayer from 'ol/layer/Tile.js'
import TileImage from 'ol/source/TileImage.js'
import TileGrid from 'ol/tilegrid/TileGrid.js'
import type { MapStateDefinition, SourceManifest } from '../domain/types.ts'

const STATIC_ROOT = 'https://web-static.kurobbs.com'

export function createOfficialTileLayer(state: MapStateDefinition, sourceManifest: SourceManifest): TileLayer<TileImage> {
  const { tileExtent } = state
  const availableTiles = new Set(state.tileIds)
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
      if (!availableTiles.has(tileId)) {
        return undefined
      }
      return `${STATIC_ROOT}/mcmap/tiles/${sourceManifest.mapResourceHash}/${state.id}/${tileId}.png?x-oss-process=image/format,webp/resize,w_${sourceManifest.tileWidth},h_${sourceManifest.tileWidth}`
    },
  })

  return new TileLayer({
    source,
    // This source has one resolution, so there is no coarser level to preload.
    preload: 0,
  })
}

export function layeredTileUrl(resourceHash: string, stateId: number, tilePath: string): string {
  return `${STATIC_ROOT}/mcmap/tiles/${resourceHash}/${stateId}${tilePath}?x-oss-process=image/format,webp/resize,w_1024,h_1024`
}
