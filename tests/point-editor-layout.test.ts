import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('inline point editor', () => {
  it('shares one map and the collapsible dock between use and edit modes', async () => {
    const source = await readFile(new URL('../src/views/ExplorerView.vue', import.meta.url), 'utf8')
    expect(source.match(/<MapCanvas /gu)).toHaveLength(1)
    expect(source).toContain('<PointEditorPanel v-if="editingMode"')
    expect(source).toContain('<ControlPanel v-else')
    expect(source).toContain('@click="store.toggleControlPanel"')
    expect(source).toContain('@edit-requested="enterEditor"')
  })
  it('uses shared marker clustering and clears the entire session on return', async () => {
    const [map, panel] = await Promise.all([
      readFile(new URL('../src/components/MapCanvas.vue', import.meta.url), 'utf8'),
      readFile(new URL('../src/components/PointEditorPanel.vue', import.meta.url), 'utf8'),
    ])
    expect(map).not.toContain("echoGrouping: 'individual'")
    expect(map).toContain("emit('editorPointsSelected', found)")
    expect(map).toContain('selectionLayer')
    expect(panel).toContain('store.resetSession()')
    expect(panel).toContain("emit('returned')")
    expect(panel).not.toContain('<PointEditorMap')
    expect(panel).not.toContain('syncMapContext')
    expect(panel).not.toContain('explorer.selectState(')
    expect(map).not.toContain('editor.setLevel(')
  })
  it('persists the editor tab independently from map state', async () => {
    const panel = await readFile(new URL('../src/components/PointEditorPanel.vue', import.meta.url), 'utf8')
    expect(panel).toContain("useRouteQuery<string>('editorTab', 'navigation', { mode: 'replace' })")
    expect(panel).toContain('tabQuery.value = editorMode.value')
    expect(panel).toContain("store.load(tabQuery.value === 'echo' ? 'echo' : 'navigation')")
    expect(panel).not.toContain('tabQuery.value = undefined')
  })

})
