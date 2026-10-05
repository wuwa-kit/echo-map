import { describe, expect, it } from 'vitest'
import { floorLabel, floorSelectOptions, floorTooltipLabel } from '../src/components/floor-label.ts'
import type { LayeredMapDefinition } from '../src/domain/types.ts'

describe('floor display labels', () => {
  it.each([
    ['天槎空间站', '封锁舱段·天槎空间站', '封锁舱段', '天槎空间站 · 封锁舱段'],
    ['天槎空间站', '实验舱段一区 · 天槎空间站', '实验舱段一区', '天槎空间站 · 实验舱段一区'],
    ['叩天关', '叩天关·上层', '上层', '叩天关 · 上层'],
    ['叩天关', '叩天关 · 上层', '上层', '叩天关 · 上层'],
    ['声骸藏区', '声骸藏区1楼', '1楼', '声骸藏区 · 1楼'],
    ['石龙寝', '石龙寝上层', '上层', '石龙寝 · 上层'],
    ['天槎空间站', '天槎空间站', '天槎空间站', '天槎空间站'],
    ['星炬学院', '文献中心·休憩区', '文献中心·休憩区', '星炬学院 · 文献中心·休憩区'],
    ['幽锁层', '雾隐枢', '雾隐枢', '幽锁层 · 雾隐枢'],
    ['天槎空间站', '旧·天槎空间站·入口', '旧·天槎空间站·入口', '天槎空间站 · 旧·天槎空间站·入口'],
    ['天槎空间站', '天槎·入口', '天槎·入口', '天槎空间站 · 天槎·入口'],
    [' 叩天关 ', ' 叩天关 · 上层 ', '上层', '叩天关 · 上层'],
  ])('formats %s / %s', (group, name, label, tooltip) => {
    expect(floorLabel(group, name)).toBe(label)
    expect(floorTooltipLabel(group, name)).toBe(tooltip)
  })

  const groups: LayeredMapDefinition[] = [
    { id: 'station', name: '天槎空间站', coverage: [], floors: [
      { id: 'station-main', name: '天槎空间站', layeredMapId: 'station', tiles: [] },
      { id: 'station-locked', name: '封锁舱段·天槎空间站', layeredMapId: 'station', tiles: [] },
      { id: 'station-upper', name: '天槎空间站·上层', layeredMapId: 'station', tiles: [] },
    ] },
    { id: 'gate', name: '叩天关', coverage: [], floors: [
      { id: 'gate-upper', name: '叩天关·上层', layeredMapId: 'gate', tiles: [] },
    ] },
  ]
  const floors = groups.flatMap(group => group.floors)

  it('uses parent-first labels for editor choices without changing their IDs, order or source names', () => {
    const available = floors.filter(({ layeredMapId }) => layeredMapId === 'station')
    expect(floorSelectOptions(groups, available)).toEqual([
      { id: 'station-main', label: '天槎空间站' },
      { id: 'station-locked', label: '天槎空间站 · 封锁舱段' },
      { id: 'station-upper', label: '天槎空间站 · 上层' },
    ])
    expect(available.map(({ name }) => name)).toEqual(['天槎空间站', '封锁舱段·天槎空间站', '天槎空间站·上层'])
  })

  it('keeps full labels consistent across different sets of available choices', () => {
    expect(floorSelectOptions(groups, floors)).toEqual([
      { id: 'station-main', label: '天槎空间站' },
      { id: 'station-locked', label: '天槎空间站 · 封锁舱段' },
      { id: 'station-upper', label: '天槎空间站 · 上层' },
      { id: 'gate-upper', label: '叩天关 · 上层' },
    ])
    expect(floorSelectOptions(groups, [])).toEqual([])
    expect(floorSelectOptions([], [{ id: 'unknown', name: '未知分层' }])).toEqual([{ id: 'unknown', label: '未知分层' }])
  })
})
