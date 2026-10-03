import { describe, expect, it } from 'vitest'
import { pointRegionResolver } from '../src/domain/point-region.ts'
import { pointFilePath, readPointFiles } from '../scripts/lib/point-files.ts'
import { projectPath } from '../scripts/lib/files.ts'
import { mapToGameCoordinate } from '../src/map/projection.ts'
import { mixedPoint, referenceDataset } from './fixtures/point-library.ts'

describe('second-level point regions', () => {
  it.each([
    ['今州城', '1-1'], ['玄方城', '1-8'], ['拉古那城', '3-3'],
    ['七丘', '3-4'], ['冰原运输港', '4-6'], ['黑海岸群岛', '900'],
  ])('uses the owning group of the main-map anchor %s', (name, id) => {
    const label = referenceDataset.regionLabels.find((label) => label.name === name && label.stateId === 8)
    if (!label) throw new Error(`缺少地区 ${name}`)
    const center = [label.coordinate.mapX, label.coordinate.mapY] as const
    expect(pointRegionResolver(referenceDataset)(8, center)?.id).toBe(id)
    const [x, y] = mapToGameCoordinate(...center)
    const point = { ...mixedPoint(), coordinate: { x: Math.round(x), y: Math.round(y), z: 18 } }
    expect(pointFilePath(point, referenceDataset, 'manual')).toBe(`echo/8/${id}.json`)
    expect(pointFilePath(point, referenceDataset, 'official')).toBe(`8/${id}.json`)
  })

  it.each([
    [912, '1-8'], [902, '3-3'], [903, '3-3'], [905, '3-3'],
    [906, '4-5'], [909, '4-7'], [900, '900'], [910, '900'],
  ])('derives independent map %s from stateId regardless of XY', (stateId, id) => {
    const resolve = pointRegionResolver(referenceDataset)
    expect(resolve(stateId)?.id).toBe(id)
    expect(resolve(stateId, [1e9, -1e9])?.id).toBe(id)
    expect(pointFilePath({ ...mixedPoint(), stateId }, referenceDataset, 'manual')).toBe(`echo/${stateId}.json`)
  })

  it('ignores smaller labels and resolves equal distances deterministically', () => {
    const label = referenceDataset.regionLabels[0]
    if (!label) throw new Error('缺少地区')
    const regions = {
      regionLabels: [
        { ...label, id: 'a', stateId: 8, coordinate: { rawX: 0, rawY: 0, mapX: -10, mapY: 0 } },
        { ...label, id: 'b', stateId: 8, coordinate: { rawX: 0, rawY: 0, mapX: 10, mapY: 0 } },
        { ...label, id: 'small', stateId: 8, level: 3, coordinate: { rawX: 0, rawY: 0, mapX: -9, mapY: 0 } },
      ],
      mapNavigation: [
        { id: 2, name: '乙', regionIds: ['b'], groups: [{ id: '2', name: '乙组', regionIds: ['b'] }] },
        { id: 1, name: '甲', regionIds: ['a'], groups: [{ id: '1', name: '甲组', regionIds: ['a'] }] },
      ],
    }
    expect(pointRegionResolver(regions)(8, [-9, 0])?.id).toBe('1-1')
    expect(pointRegionResolver(regions)(8, [0, 0])?.id).toBe('1-1')
    expect(pointRegionResolver({ ...regions, mapNavigation: regions.mapNavigation.toReversed() })(8, [0, 0])?.id).toBe('1-1')
    expect(pointRegionResolver(regions)(999, [0, 0])).toBeNull()
  })

  it('loads every committed shard with valid placement and no duplicate IDs', async () => {
    const manual = await readPointFiles(projectPath('data', 'manual'), referenceDataset, 'manual')
    const official = await readPointFiles(projectPath('data', 'generated', 'official-echo'), referenceDataset, 'official')
    expect(manual.library.points.length).toBeGreaterThan(0)
    expect(official.library.points.length).toBeGreaterThan(0)
    for (const text of [...manual.texts.values(), ...official.texts.values()]) {
      expect(text).not.toContain('countryId')
      expect(text).not.toContain(': null')
    }
  })
})
