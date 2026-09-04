import { describe, expect, it } from 'vitest'
import { calculateTileExtent, layeredTileExtent, officialToMapCoordinate } from '../src/map/projection.ts'

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
})
