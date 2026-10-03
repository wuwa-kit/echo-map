import { describe, expect, it } from 'vitest'
import { isOfficialEchoMapIncluded, selectOfficialEchoLocations } from '../src/domain/official-echo-scope.ts'
import { parsePointLibrary } from '../src/domain/point-library.ts'
import { convertOfficialPoints } from '../scripts/lib/official-point-library.ts'
import { readPublicPointData, splitMapDataset } from '../scripts/lib/map-data.ts'
import { mapToGameCoordinate } from '../src/map/projection.ts'
import { mixedPoint, referenceDataset } from './fixtures/point-library.ts'

function locationAt(name: string) {
  const label = referenceDataset.regionLabels.find((region) => region.name === name)
  const source = referenceDataset.echoLocations[0]
  if (!label || !source) throw new Error(`缺少测试来源：${name}`)
  return { ...source, id: name, stateId: label.stateId, levelId: null, gravityType: null, coordinate: label.coordinate }
}

describe('fixed official echo map coverage', () => {
  it.each([
    ['今州城', true], ['拉古那城', true], ['七丘', true], ['冰原运输港', true],
    ['黑海岸群岛', true], ['泰缇斯之底', true], ['时隙废都', true],
    ['阿维纽林', true], ['下层金库', true], ['隐海试验场', true],
    ['蚀刻平原', true], ['恒黯之原', true], ['玄方城', false], ['梦枢天罗', false],
  ])('checks official coverage for %s', (name, expected) => {
    const point = locationAt(name)
    expect(isOfficialEchoMapIncluded(referenceDataset, point.stateId, [point.coordinate.mapX, point.coordinate.mapY])).toBe(expected)
  })

  it('excludes new independent maps even under an included region and new groups on the shared map', () => {
    const baseState = referenceDataset.states.find(({ id }) => id === 8)
    const anchor = referenceDataset.regionLabels.find(({ name }) => name === '今州城')
    if (!baseState || !anchor) throw new Error('缺少测试地图')
    const futureAnchor = { ...anchor, id: 'future-region', coordinate: { mapX: 1e6, mapY: 1e6, rawX: 1e8, rawY: -1e8 } }
    const independentAnchor = { ...anchor, id: 'future-map', stateId: 777 }
    const dataset = {
      ...referenceDataset,
      states: [...referenceDataset.states, { ...baseState, id: 777, name: '新独立地图' }],
      regionLabels: [...referenceDataset.regionLabels, futureAnchor, independentAnchor],
      mapNavigation: referenceDataset.mapNavigation.map((country) => country.id === 1 ? {
        ...country,
        regionIds: [...country.regionIds, futureAnchor.id, independentAnchor.id],
        groups: [
          ...country.groups.map((group) => group.id === '1' ? { ...group, regionIds: [...group.regionIds, independentAnchor.id] } : group),
          { id: '99', name: '新二级地区', regionIds: [futureAnchor.id] },
        ],
      } : country),
      echoLocations: [
        locationAt('今州城'), locationAt('玄方城'), locationAt('梦枢天罗'),
        { ...locationAt('今州城'), id: 'new-map', stateId: 777 },
        { ...locationAt('今州城'), id: 'new-region', coordinate: futureAnchor.coordinate },
      ],
    }
    expect(selectOfficialEchoLocations(dataset).map(({ id }) => id)).toEqual(['今州城'])
    expect(splitMapDataset(dataset).locations.echoLocations.map(({ id }) => id)).toEqual(['今州城'])
    const library = convertOfficialPoints(dataset)
    expect(library.points.flatMap(({ officialIds }) => officialIds ?? [])).toEqual(['今州城'])
  })

  it.each(['玄方城', '梦枢天罗'])('rejects persisted official points in %s while allowing manual records', (name) => {
    const source = locationAt(name)
    const [x, y] = mapToGameCoordinate(source.coordinate.mapX, source.coordinate.mapY)
    const manual = { ...mixedPoint(), stateId: source.stateId, coordinate: { x: Math.round(x), y: Math.round(y), z: 0 } }
    expect(parsePointLibrary({ version: 1, points: [manual] }, referenceDataset, 'manual').points).toEqual([manual])
    expect(() => parsePointLibrary({ version: 1, points: [{ ...manual, officialIds: ['excluded-source'] }] }, referenceDataset, 'official')).toThrow('不在收录地图范围内')
  })

  it('publishes only included official sources while keeping Mengzhou available for manual mapping', async () => {
    const data = await readPublicPointData(referenceDataset)
    expect(data.officialEcho.locations).toEqual(splitMapDataset(referenceDataset).locations.echoLocations)
    expect(selectOfficialEchoLocations(referenceDataset)).toEqual(referenceDataset.echoLocations)
    expect(data.officialEcho.library.points.some(({ stateId }) => stateId === 912)).toBe(false)
    expect(referenceDataset.states.some(({ id }) => id === 912)).toBe(true)
    expect(data.manualNavigation.points.length).toBeGreaterThan(0)
  })
})
