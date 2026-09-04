import { describe, expect, it } from 'vitest'
import {
  calculateTileExtent,
  layeredTileExtent,
  mapToGameCoordinate,
  officialToMapCoordinate,
} from '../src/map/projection.ts'

describe('official map projection', () => {
  it('matches the official map frontend conversion', () => {
    expect(officialToMapCoordinate(0, 0)).toEqual({
      rawX: 0,
      rawY: 0,
      mapX: 1024,
      mapY: -0,
    })
    const converted = officialToMapCoordinate(-49_684, 44_883)
    expect(converted.mapX).toBeCloseTo(425.454, 2)
    expect(converted.mapY).toBeCloseTo(-540.707, 2)
  })

  it('calculates an OpenLayers extent from official TMS ids', () => {
    expect(calculateTileExtent(['8_-1_-1', '8_0_0'], 1024)).toEqual({
      minTileX: -1,
      minTileY: -1,
      maxTileX: 0,
      maxTileY: 0,
      extent: [-1024, -2048, 1024, 0],
    })
  })

  it('places layered image tiles in the same coordinate space', () => {
    expect(layeredTileExtent('/1/-1/3_-3.png')).toEqual([3072, -4096, 4096, -3072])
  })

  it('uses the top-right corner of theoretical tile 0,0 as the game-coordinate origin', () => {
    expect(mapToGameCoordinate(1024, 0)).toEqual([0, 0])
    expect(mapToGameCoordinate(2048, 0)).toEqual([850, 0])
    expect(mapToGameCoordinate(1024, -1024)).toEqual([0, 850])
    expect(mapToGameCoordinate(1024, 1024)).toEqual([0, -850])
  })

  it('derives coordinates without requiring tile 0,0 to exist', () => {
    const extent = calculateTileExtent(['903_-2_2', '903_-1_2'])
    expect(extent.extent).toEqual([-2048, 1024, 0, 2048])
    expect(mapToGameCoordinate(extent.extent[0], extent.extent[3])).toEqual([-2550, -1700])
  })
})
