import { describe, expect, it } from 'vitest'
import Projection from 'ol/proj/Projection.js'
import { createOfficialTileLayer } from '../src/map/official-source.ts'
import { calculateTileExtent, gameToMapCoordinate, layeredTileExtent } from '../src/map/projection.ts'
import { createMapView } from '../src/map/useMapViewport.ts'
import { gameScaleForResolution } from '../src/map/map-scale.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'

const dataset = await readMapDataset()

describe('tile image resolution independence', () => {
  it.each([512, 1024, 2048, 4096])('keeps a %s-pixel image within the same 850-unit tile at the same zoom', (tileWidth) => {
    const state = {
      id: 8, name: '测试地图', tileIds: ['8_0_1'], gravityTiles: ['/2/0_1.png'],
      tileExtent: calculateTileExtent(['8_0_1']), layeredMaps: [],
    }
    const view = createMapView(state, new Projection({ code: 'TEST:TILE-SCALE', units: 'pixels' }))
    for (const gravity of [1, 2] as const) {
      const layer = createOfficialTileLayer(state, { ...dataset.source, tileWidth }, gravity)
      const grid = layer.getSource()?.getTileGrid()
      expect(grid?.getTileCoordExtent([0, 0, 0])).toEqual([0, 0, 850, 850])
      expect(grid?.getResolution(0)).toBe(850 / tileWidth)
      expect(layeredTileExtent('/floor/0_1.png')).toEqual([0, 0, 850, 850])
      for (const zoom of [-2, -1, 0, 1, 3]) {
        view.setZoom(zoom)
        const resolution = view.getResolution() ?? NaN
        expect(resolution).toBe(2 ** -zoom)
        expect(gameScaleForResolution(resolution)).toBe(resolution)
        expect(850 / resolution).toBe(850 * 2 ** zoom)
        expect(gameToMapCoordinate(-425, -425)).toEqual([425, 425])
      }
      layer.getSource()?.dispose()
      layer.dispose()
    }
  })
})
