import { readFile, readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const sourceRootUrl = new URL('../src/', import.meta.url)
const sourceExtensions = new Set(['.ts', '.tsx', '.vue'])
const forbiddenPatterns = [
  /\baria-[\w-]+\s*=/i,
  /\brole\s*=/i,
  /\btabindex\s*=/i,
  /<label\b/i,
  /\balt\s*=/i,
  /\bsr-only\b/i,
  /\.inert\b/,
]

// Keyboard point entry resumes in the position field after saving.
const keyboardEntryFocus = new Map([
  [new URL('../src/components/base/WuCoordinateInput.vue', import.meta.url).href, "defineExpose({ focus: () => container.value?.querySelector('input')?.focus() })"],
  [new URL('../src/components/PointCoordinateFields.vue', import.meta.url).href, 'defineExpose({ focus: () => coordinateInput.value?.focus() })'],
  [new URL('../src/components/PointEditorPanel.vue', import.meta.url).href, 'if (active) positionFields.value?.focus()'],
])

async function collectSourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: URL[] = []
  for (const entry of entries) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(url))
    } else if (sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      files.push(url)
    }
  }
  return files
}

describe('源码语义约束', () => {
  it('不包含无障碍语义属性和专用焦点逻辑', async () => {
    for (const file of await collectSourceFiles(sourceRootUrl)) {
      const source = await readFile(file, 'utf8')
      for (const pattern of forbiddenPatterns) {
        expect(source, `${file.pathname} 命中 ${pattern}`).not.toMatch(pattern)
      }
      const allowedFocus = keyboardEntryFocus.get(file.href)
      if (allowedFocus) expect(source).toContain(allowedFocus)
      expect(allowedFocus ? source.replace(allowedFocus, '') : source, `${file.pathname} 包含未授权的焦点调用`).not.toMatch(/\.focus\s*\(/)
    }
  })
})
