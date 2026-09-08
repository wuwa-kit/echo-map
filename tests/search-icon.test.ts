import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const echoFilterSourceUrl = new URL('../src/components/filters/EchoFilter.vue', import.meta.url)
const multiSelectSourceUrl = new URL('../src/components/base/WuMultiSelect.vue', import.meta.url)
const searchIconSourceUrl = new URL('../src/assets/svg/search.svg', import.meta.url)

describe('搜索图标', () => {
  it('统一使用右下手柄的固定尺寸 SVG，不回退到字体字符', async () => {
    const sources = await Promise.all([
      readFile(echoFilterSourceUrl, 'utf8'),
      readFile(multiSelectSourceUrl, 'utf8'),
    ])
    for (const source of sources) {
      expect(source).toMatch(/<WuSvg name="search" class="[^"]*\[--wu-svg-h:14px\][^"]*" \/>/)
      expect(source).not.toContain('⌕')
    }

    const icon = await readFile(searchIconSourceUrl, 'utf8')
    expect(icon).toContain('<svg viewBox="0 0 24 24">')
    expect(icon).toContain('d="m16.25 16.25 4.25 4.25"')
    expect(icon).toContain('stroke="currentColor"')
  })
})
