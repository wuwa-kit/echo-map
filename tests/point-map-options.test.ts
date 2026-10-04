import { describe, expect, it } from 'vitest'
import { cascaderColumns, resolveCascaderChoice } from '../src/components/base/cascader.ts'
import { pointMapFilterCounts, pointMapFilterOptions, pointMapFilterSelection, pointMapScopeValues } from '../src/components/point-map-options.ts'
import type { PointMapFilterOption } from '../src/components/point-map-options.ts'
import { pointRegionResolver } from '../src/domain/point-region.ts'
import { mapToGameCoordinate } from '../src/map/projection.ts'
import { mixedPoint, referenceDataset } from './fixtures/point-library.ts'

const samples = ['玄方城', '梦枢天罗', '今州城', '阿维纽林', '泰缇斯之底', '蚀刻平原', '恒黯之原'].map(name => {
  const label = referenceDataset.regionLabels.find(label => label.name === name)
  if (!label) throw new Error(`缺少地区 ${name}`)
  const coordinate = [label.coordinate.mapX, label.coordinate.mapY] as const
  const [x, y] = mapToGameCoordinate(...coordinate)
  return {
    point: { ...mixedPoint(name), stateId: label.stateId, coordinate: { x: Math.round(x), y: Math.round(y), z: 18 } },
    region: pointRegionResolver(referenceDataset)(label.stateId, coordinate),
  }
})
const regions = new Map(samples.map(({ point, region }) => [point.id, region]))
const counts = pointMapFilterCounts(samples.map(({ point }) => point), regions)
const options = pointMapFilterOptions(referenceDataset, counts)
const leaves = (items: readonly PointMapFilterOption[]): PointMapFilterOption[] => items.flatMap(item => item.children ? leaves(item.children) : [item])

describe('point management map scopes', () => {
  it.each([
    ['', samples.map(({ point }) => point.id)],
    ['country:1', ['玄方城', '梦枢天罗', '今州城']],
    ['region:1-8', ['玄方城', '梦枢天罗']],
    ['map:1-8:8', ['玄方城']],
    ['map:1-8:912', ['梦枢天罗']],
  ])('counts and filters scope %s without leaking other regions on the shared surface map', (value, expected) => {
    const matching = samples.filter(({ point, region }) => pointMapScopeValues(point.stateId, region).includes(value))
    expect(matching.map(({ point }) => point.id)).toEqual(expected)
    expect(counts.get(value)).toBe(expected.length)
  })

  it('offers country, region, surface and submap choices using at most three columns', () => {
    const country = resolveCascaderChoice(options, [], 0, 'browse:country:1')
    const region = resolveCascaderChoice(options, country?.path ?? [], 1, 'browse:region:1-8')
    const columns = cascaderColumns(options, region?.path ?? [])
    expect(columns).toHaveLength(3)
    expect(columns[1]?.options[0]).toMatchObject({ label: '全部', value: 'country:1', count: 3 })
    expect(columns[2]?.options.map(({ value, label, count }) => ({ value, label, count }))).toEqual([
      { value: 'region:1-8', label: '全部', count: 2 },
      { value: 'map:1-8:8', label: '地表', count: 1 },
      { value: 'map:1-8:912', label: '梦枢天罗', count: 1 },
    ])
    expect(pointMapFilterSelection(options, 'map:1-8:912')).toEqual({
      value: 'map:1-8:912', label: '瑝珑-梦州-梦枢天罗', expandedValues: ['browse:country:1', 'browse:region:1-8'],
    })
    expect(pointMapFilterSelection(options, 'map:1-8:8').label).toBe('瑝珑-梦州-地表')
  })

  it('omits redundant group levels and map names for Black Shores, Lahai-Roi and the dark plains', () => {
    const shores = cascaderColumns(options, ['browse:country:900'])
    expect(shores).toHaveLength(2)
    expect(shores[1]?.options.map(({ label }) => label)).toEqual(['全部', '地表', '泰缇斯之底', '时隙废都'])
    expect(pointMapFilterSelection(options, 'map:900:900').label).toBe('黑海岸-泰缇斯之底')
    const icefield = cascaderColumns(options, ['browse:country:4'])
    expect(icefield[1]?.options.find(({ value }) => value === 'region:4-5')).toMatchObject({ label: '拉海洛', children: undefined })
    expect(pointMapFilterSelection(options, 'region:4-5').label).toBe('罗伊冰原-拉海洛')
    expect(pointMapFilterSelection(options, 'region:4-7').label).toBe('罗伊冰原-黯原')
  })

  it('keeps selected empty scopes and their paths, while disabling new zero-count choices and preserving reset', () => {
    const empty = pointMapFilterOptions(referenceDataset, new Map())
    const selected = pointMapFilterSelection(empty, 'map:1-8:912')
    expect(selected.label).toBe('瑝珑-梦州-梦枢天罗')
    expect(cascaderColumns(empty, selected.expandedValues)).toHaveLength(3)
    expect(leaves(empty).filter(({ value }) => value !== '').every(({ count, disabled }) => count === 0 && disabled)).toBe(true)
    expect(resolveCascaderChoice(empty, selected.expandedValues, 2, selected.value)).toBeNull()
    expect(resolveCascaderChoice(empty, [], 0, '')).toMatchObject({ kind: 'select', option: { disabled: false, count: 0 } })
  })

  it('recounts all scopes after other filters change and ignores invalid URL scopes', () => {
    const subset = samples.filter(({ point }) => point.id === '梦枢天罗' || point.id === '阿维纽林')
    const next = pointMapFilterOptions(referenceDataset, pointMapFilterCounts(subset.map(({ point }) => point), regions))
    expect(next.find(({ value }) => value === 'browse:country:1')?.count).toBe(1)
    expect(next.find(({ value }) => value === 'browse:country:3')?.count).toBe(1)
    expect(leaves(next).find(({ value }) => value === 'map:1-8:8')?.disabled).toBe(true)
    for (const value of ['country:999', 'region:3-8', 'map:1-8:903', 'browse:country:1', '8']) {
      expect(pointMapFilterSelection(next, value)).toEqual({ value: '', label: '全部地图 / 地区', expandedValues: [] })
    }
  })
})
