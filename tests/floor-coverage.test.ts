import { describe, expect, it } from 'vitest'
import { encodeFloorCoverage, mergeFloorAlpha } from '../scripts/lib/map/floor-coverage.ts'
import { floorCoverageTileSchema, mapDataSchema } from '../src/domain/schema.ts'
import { createFloorCoverage, floorGroupsInViewport } from '../src/map/floor-coverage.ts'
import { readMapDataset, splitMapDataset } from '../scripts/lib/map-data.ts'
import type { MapStateDefinition } from '../src/domain/types.ts'

const dataset = await readMapDataset()

describe('generated floor coverage', () => {
  it('detects every group whose opaque footprint intersects the viewport', () => {
    const reference = dataset.states[0]
    if (!reference) throw new Error('缺少地图数据')
    const state: MapStateDefinition = { ...reference, layeredMaps: [
      { id: 'large', name: '大区域', floors: [], coverage: [{ tile: '0_1.png', size: 4, runs: [[0, 16]] }] },
      { id: 'small', name: '小区域', floors: [], coverage: [{ tile: '0_1.png', size: 4, runs: [[5, 6]] }] },
    ] }
    const coverage = createFloorCoverage(state, 4)
    expect(floorGroupsInViewport(coverage, [1.25, 2.25, 1.75, 2.75])).toEqual(['large', 'small'])
    expect(floorGroupsInViewport(coverage, [3.9, 1, 5, 2])).toEqual(['large'])
    expect(floorGroupsInViewport(coverage, [4, 1, 5, 2])).toEqual([])
    expect(floorGroupsInViewport(coverage, [0, 3, 1, 4])).toEqual(['large'])
  })

  it('unions sibling alpha masks, excludes transparent pixels and keeps interval gaps', () => {
    const mask = new Uint8Array(16)
    const image = (alphas: number[]) => ({ width: 4, height: 4, data: Uint8Array.from(alphas.flatMap((alpha) => [255, 255, 255, alpha])) })
    mergeFloorAlpha(mask, image([255, 255, 0, 15, 0, 0, 0, 0, 16, 255, 255, 0, 0, 0, 0, 255]), 4)
    mergeFloorAlpha(mask, image([0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 4)
    expect(encodeFloorCoverage('-7_1.png', mask, 4)).toEqual({ tile: '-7_1.png', size: 4, runs: [[0, 3], [8, 11], [15, 16]] })
    expect(encodeFloorCoverage('0_1.png', new Uint8Array(16), 4).runs).toEqual([])
  })

  it('maps source pixels conservatively when images differ in resolution', () => {
    const mask = new Uint8Array(16)
    mergeFloorAlpha(mask, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255]) }, 4)
    expect(encodeFloorCoverage('0_1.png', mask, 4).runs).toEqual([[0, 16]])
    const tiny = new Uint8Array(1)
    mergeFloorAlpha(tiny, { width: 2, height: 2, data: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]) }, 1)
    expect([...tiny]).toEqual([1])
    expect(() => mergeFloorAlpha(mask, { width: 2, height: 2, data: new Uint8Array(3) }, 4)).toThrow('无效楼层图片尺寸')
  })

  it('rejects overlapping, unsorted, adjacent or out-of-range intervals and unknown tiles', () => {
    for (const runs of [[[3, 2]], [[0, 17]], [[0, 3], [2, 4]], [[0, 3], [3, 4]], [[5, 6], [1, 2]]]) {
      expect(floorCoverageTileSchema.safeParse({ tile: '0_1.png', size: 4, runs }).success).toBe(false)
    }
    const { map } = splitMapDataset(dataset)
    const changed = structuredClone(map)
    const group = changed.states.flatMap(({ layeredMaps }) => layeredMaps).find(({ coverage }) => coverage.length)
    if (!group?.coverage[0]) throw new Error('缺少覆盖数据')
    group.coverage[0].tile = '9999_9999.png'
    expect(mapDataSchema.safeParse(changed).success).toBe(false)
  })

  it('distinguishes the three real groups sharing tile -7_1 and leaves transparent space unassigned', () => {
    const state = dataset.states.find(({ id }) => id === 8) ?? null
    const coverage = createFloorCoverage(state, dataset.source.tileWidth)
    const viewportAt = (x: number, y: number): [number, number, number, number] => [x - 0.1, y - 0.1, x + 0.1, y + 0.1]
    expect(floorGroupsInViewport(coverage, viewportAt(-6502.5, 450.5))).toEqual(['56'])
    expect(floorGroupsInViewport(coverage, viewportAt(-6525.5, 455.5))).toEqual(['57'])
    expect(floorGroupsInViewport(coverage, viewportAt(-6744.5, -0.5))).toEqual(['58'])
    expect(floorGroupsInViewport(coverage, viewportAt(-7160, 1010))).toEqual([])
    for (const state of dataset.states) {
      for (const group of state.layeredMaps) {
        const tiles = new Set(group.floors.flatMap(({ tiles }) => tiles.map((tile) => tile.split('/').at(-1))))
        expect(new Set(group.coverage.map(({ tile }) => tile))).toEqual(tiles)
      }
    }
  })
})
