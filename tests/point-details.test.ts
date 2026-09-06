import { describe, expect, it } from 'vitest'
import { describeEchoPoint } from '../src/domain/point-details.ts'
import { libraryLocations } from '../src/domain/point-library.ts'
import { mixedPoint, referenceDataset, smallEcho, eliteEcho } from './fixtures/point-library.ts'

const { echoLocations } = libraryLocations({ version: 1, points: [mixedPoint()] }, referenceDataset)
const location = echoLocations[0]
if (!location) throw new Error('测试数据缺少人工点位')

describe('point detail quantities', () => {
  it('shows recorded quantities with an incomplete composition', () => {
    const details = describeEchoPoint(location, referenceDataset.echoes)
    expect(details.summary).toBe('已录入 2种 · 4只')
    expect(details.compositionLabel).toBe('可继续补录')
    expect(details.members.map(({ count }) => count)).toEqual([3, 1])
    expect(details.title).toBe(`${smallEcho.name} · ${eliteEcho.name}`)
  })

  it('labels the full quantity only after the composition is complete', () => {
    const details = describeEchoPoint({ ...location, compositionStatus: 'complete' }, referenceDataset.echoes)
    expect(details.summary).toBe('共 2种 · 4只')
    expect(details.compositionLabel).toBe('怪物清单已补齐')
  })

  it('never presents official placeholder counts as verified quantities', () => {
    const official = { ...location, quality: 'official-provisional', compositionStatus: 'complete' } as const
    const details = describeEchoPoint(official, referenceDataset.echoes)
    expect(details.summary).toBe('2种 · 数量待核验')
    expect(details.compositionLabel).toBeNull()
    expect(details.members.map(({ count }) => count)).toEqual([null, null])
    expect(details.title).not.toContain('×')
    expect(official.members.map(({ count }) => count)).toEqual([3, 1])
  })

  it('keeps legacy unknown counts unknown and tolerates missing echo definitions', () => {
    const legacy = referenceDataset.echoLocations[0]
    if (!legacy) throw new Error('测试数据缺少旧格式点位')
    const details = describeEchoPoint(legacy, [])
    expect(details.summary).toContain('数量待核验')
    expect(details.members[0]?.count).toBeNull()
    expect(details.members[0]?.name).toBe(legacy.echoId)
  })
})
