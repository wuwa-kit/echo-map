import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const controlPanelSourceUrl = new URL('../src/components/ControlPanel.vue', import.meta.url)
const mapScopeFilterSourceUrl = new URL('../src/components/filters/MapScopeFilter.vue', import.meta.url)

describe('control panel layout', () => {
  it('omits the dataset counters and current base-map label', async () => {
    const controlPanelSource = await readFile(controlPanelSourceUrl, 'utf8')
    const mapScopeFilterSource = await readFile(mapScopeFilterSourceUrl, 'utf8')

    expect(controlPanelSource).not.toContain('dataset.report.includedEchoCount')
    expect(controlPanelSource).not.toContain('grid-cols-3')
    expect(controlPanelSource).not.toContain('官方点 Z=0、数量为初始值')
    expect(controlPanelSource).toContain('>点位录入</RouterLink>')
    expect(controlPanelSource).toContain('>资产浏览</RouterLink>')
    expect(controlPanelSource).toContain("{ value: 'manual', label: '人工点位' }")
    expect(controlPanelSource).toContain("{ value: 'official', label: '官方点位' }")
    expect(controlPanelSource).toContain('@click="togglePointSourceFilter(option.value)"')
    expect(controlPanelSource).not.toContain('全部点位')
    expect(controlPanelSource).not.toContain('仅人工')
    expect(controlPanelSource).not.toContain('仅官方')
    expect(controlPanelSource).not.toContain('浏览官方资产 →')
    expect(controlPanelSource).not.toContain('打开点位录入 →')
    expect(controlPanelSource).not.toContain('canEdit')
    expect(mapScopeFilterSource).not.toContain('当前底图')
    expect(mapScopeFilterSource).not.toContain('activeMapName')
    expect(mapScopeFilterSource).toContain('<div v-if="supportsGravity"')
  })
})
