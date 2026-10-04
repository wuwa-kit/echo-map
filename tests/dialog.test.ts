import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const dialogSourceUrl = new URL('../src/components/base/WuDialog.vue', import.meta.url)
const editorViewSourceUrl = new URL('../src/components/PointEditorPanel.vue', import.meta.url)

describe('WuDialog', () => {
  it('uses the native modal dialog for unsaved changes', async () => {
    const [dialogSource, editorViewSource] = await Promise.all([
      readFile(dialogSourceUrl, 'utf8'),
      readFile(editorViewSourceUrl, 'utf8'),
    ])

    expect(dialogSource).toContain('<dialog')
    expect(dialogSource).toContain('element.showModal()')
    expect(dialogSource).toContain('@cancel="onCancel"')
    expect(editorViewSource).toContain('<WuDialog :open="pending !== null"')
    expect(editorViewSource).not.toContain('<div v-if="pending"')
  })
})
