import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const pointDetailsSourceUrl = new URL('../src/components/PointDetails.vue', import.meta.url)
const pointEditorSourceUrl = new URL('../src/views/PointEditorView.vue', import.meta.url)

describe('point detail hints', () => {
  it('omits provisional-height and inferred-arrival notices', async () => {
    const [detailsSource, editorSource] = await Promise.all([
      readFile(pointDetailsSourceUrl, 'utf8'),
      readFile(pointEditorSourceUrl, 'utf8'),
    ])

    expect(detailsSource).not.toContain('Z=0 为占位值')
    expect(detailsSource).not.toContain('传送落点未单独录入')
    expect(detailsSource).not.toContain('传送落点未录入')
    expect(detailsSource).not.toContain('navigationRouteCoordinate')
    expect(detailsSource).not.toContain("'点位详情'")
    expect(detailsSource).not.toContain('图标 XYZ')
    expect(detailsSource).not.toContain('图标点位未录入 XYZ')
    expect(detailsSource).toContain('>×</button>')
    expect(editorSource).not.toContain('官方 · Z=0')
    expect(editorSource).not.toContain('Z=0 不代表实际高度')
    expect(editorSource).not.toContain('实际落点留空时按图标点位规划')
  })
})
