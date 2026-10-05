import { describe, expect, it } from 'vitest'
import { floorLabel, floorTooltipLabel } from '../src/components/floor-label.ts'

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
})
