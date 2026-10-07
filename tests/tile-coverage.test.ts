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
    expect(hitsMapTile(state, [-1275, null], null)).toBe(true)
    expect(hitsMapTile(state, [-425, null], null)).toBe(false)
    expect(hitsMapTile(state, [100000, null], null)).toBe(false)
    expect(hitsMapTile(state, [null, 425], null)).toBe(true)
    expect(hitsMapTile(state, [null, -425], null)).toBe(false)
    expect(hitsMapTile(state, [null, null], null)).toBe(false)
    expect(hitsMapTile(state, [425, null], 2)).toBe(false)
    expect(hitsMapTile(state, [1275, null], null, 'floor')).toBe(true)
  })

  it('checks actual tiles including negative coordinates and closed edges in game units', () => {
    const hit = (x: number, y: number) => hitsMapTile(state, mapToGameCoordinate(x * 850, y * 850), null)
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
    const surface = mapToGameCoordinate(1275, -425)
    const floor = mapToGameCoordinate(2125, -425)
    expect(hitsMapTile(state, surface, 2)).toBe(false)
    expect(hitsMapTile(state, mapToGameCoordinate(-425, -425), 2)).toBe(true)
    expect(hitsMapTile(state, floor, 1)).toBe(false)
    expect(hitsMapTile(state, floor, 1, 'floor')).toBe(true)
    expect(hitsMapTile(state, surface, 1, 'floor')).toBe(false)
    expect(hitsMapTile(state, floor, 1, 'unknown')).toBe(false)
    expect(hitsMapTile({ ...state, tileIds: [] }, surface, 1)).toBe(false)
    expect(hitsMapTile(state, [Infinity, 0], 1)).toBe(false)
  })
})
