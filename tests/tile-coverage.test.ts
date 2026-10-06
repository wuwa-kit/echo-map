import { describe, expect, it } from 'vitest'
import type { MapStateDefinition } from '../src/domain/types.ts'
import { calculateTileExtent, mapToGameCoordinate } from '../src/map/projection.ts'
import { hitsMapTile } from '../src/map/tile-coverage.ts'

const state: MapStateDefinition = {
  id: 8, name: '测试地图',
  tileIds: ['8_-1_0', '8_1_0'],
  gravityTiles: ['/2/-1_0.png'],
  tileExtent: calculateTileExtent(['8_-1_0', '8_1_0']),
  layeredMaps: [{ id: 'group', name: '楼层组', coverage: [], floors: [
    { id: 'floor', name: '楼层', layeredMapId: 'group', tiles: ['/group/floor/2_0.png'] },
  ] }],
}

describe('map tile coverage', () => {
  it('checks a known axis against actual tile intervals without filling in the other axis', () => {
    expect(hitsMapTile(state, 1024, [-1275, null], null)).toBe(true)
    expect(hitsMapTile(state, 1024, [-425, null], null)).toBe(false)
    expect(hitsMapTile(state, 1024, [100000, null], null)).toBe(false)
    expect(hitsMapTile(state, 1024, [null, 425], null)).toBe(true)
    expect(hitsMapTile(state, 1024, [null, -425], null)).toBe(false)
    expect(hitsMapTile(state, 1024, [null, null], null)).toBe(false)
    expect(hitsMapTile(state, 1024, [425, null], 2)).toBe(false)
    expect(hitsMapTile(state, 1024, [1275, null], null, 'floor')).toBe(true)
  })

  it.each([512, 1024])('checks actual tiles including negative coordinates and closed edges at width %s', (width) => {
    const hit = (x: number, y: number) => hitsMapTile(state, width, mapToGameCoordinate(x * width, y * width, width), null)
    expect(hit(-0.5, -0.5)).toBe(true)
    expect(hit(1.5, -0.5)).toBe(true)
    expect(hit(0.5, -0.5)).toBe(false)
    expect(hit(3, -0.5)).toBe(false)
    for (const x of [-1, 0, 1, 2]) {
      expect(hit(x, 0)).toBe(true)
      expect(hit(x, -1)).toBe(true)
    }
    expect(hit(2.001, -0.5)).toBe(false)
  })

  it('uses gravity or selected floor tiles independently of the surface', () => {
    const surface = mapToGameCoordinate(1536, -512)
    const floor = mapToGameCoordinate(2560, -512)
    expect(hitsMapTile(state, 1024, surface, 2)).toBe(false)
    expect(hitsMapTile(state, 1024, mapToGameCoordinate(-512, -512), 2)).toBe(true)
    expect(hitsMapTile(state, 1024, floor, 1)).toBe(false)
    expect(hitsMapTile(state, 1024, floor, 1, 'floor')).toBe(true)
    expect(hitsMapTile(state, 1024, surface, 1, 'floor')).toBe(false)
    expect(hitsMapTile(state, 1024, floor, 1, 'unknown')).toBe(false)
    expect(hitsMapTile({ ...state, tileIds: [] }, 1024, surface, 1)).toBe(false)
    expect(hitsMapTile(state, 1024, [Infinity, 0], 1)).toBe(false)
  })
})
