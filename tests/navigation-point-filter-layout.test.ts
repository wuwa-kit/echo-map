import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const filterSourceUrl = new URL('../src/components/filters/NavigationPointFilter.vue', import.meta.url)

describe('navigation point filter layout', () => {
  it('uses one tri-state summary row and keeps list items concise', async () => {
    const source = await readFile(filterSourceUrl, 'utf8')

    expect(source).toContain('>定位点显示</span>')
    expect(source).not.toContain('MAP POINT ICONS')
    expect(source).toContain(':model-value="allCurrentPointGroupsVisible"')
    expect(source).toContain(':indeterminate="someCurrentPointGroupsVisible"')
    expect(source).toContain('{{ visiblePointGroupCount }} / {{ pointGroupOptions.length }}')
    expect(source).toContain('@update:model-value="setCurrentPointGroupsVisible"')
    expect(source).toContain('min-[1024px]:max-h-290px')
    expect(source).not.toContain('全部显示')
    expect(source).not.toContain('全部隐藏')
    expect(source).not.toContain('勾选表示允许显示')
    expect(source).not.toContain('pointGroup.typeCount')
  })
})
