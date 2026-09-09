import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const messageSourceUrl = new URL('../src/components/base/WuMessage.vue', import.meta.url)
const editorViewSourceUrl = new URL('../src/views/PointEditorView.vue', import.meta.url)

describe('WuMessage', () => {
  it('renders editor feedback as a dismissible overlay instead of a layout banner', async () => {
    const [messageSource, editorViewSource] = await Promise.all([
      readFile(messageSourceUrl, 'utf8'),
      readFile(editorViewSourceUrl, 'utf8'),
    ])

    expect(messageSource).toContain('popover="manual"')
    expect(messageSource).toContain('useTimeoutFn')
    expect(messageSource).toContain("type?: 'info' | 'error'")
    expect(editorViewSource).toContain('<WuMessage v-if="error"')
    expect(editorViewSource).toContain('<WuMessage v-else-if="notice"')
    expect(editorViewSource).not.toContain('<div v-if="error" class="shrink-0')
    expect(editorViewSource).not.toContain('<div v-else-if="notice" class="shrink-0')
  })
})
