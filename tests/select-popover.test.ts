import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const selectSourceUrl = new URL('../src/components/base/WuSelect.vue', import.meta.url)
const scrollAreaSourceUrl = new URL('../src/components/base/WuScrollArea.vue', import.meta.url)

function hasUnconditionalPopoverDisplayClass(source: string): boolean {
  const popoverTag = source.match(/<div(?=[^>]*\bpopover="auto")[^>]*>/s)?.[0]
  if (!popoverTag) {
    throw new Error('未找到 WuSelect Popover 容器')
  }
  const classNames = popoverTag.match(/\bclass="([^"]*)"/)?.[1] ?? ''
  return /(?:^|\s)(?:block|flex|grid|inline|inline-block|inline-flex|inline-grid)(?:\s|$)/.test(classNames)
}

function usesCompactSelectList(source: string): boolean {
  const popoverTag = source.match(/<div(?=[^>]*\bpopover="auto")[^>]*>/s)?.[0] ?? ''
  const scrollAreaTag = source.match(/<WuScrollArea\b[^>]*>/s)?.[0] ?? ''
  return popoverTag.includes('p-4px')
    && scrollAreaTag.includes('size="sm"')
    && !scrollAreaTag.includes('viewport-class=')
}

function hasCompactScrollbarVariant(source: string): boolean {
  return source.includes("size?: 'md' | 'sm'")
    && source.includes("'bottom-1px right-0 top-1px w-4px'")
    && source.includes("'w-2px'")
}

describe('WuSelect Popover', () => {
  it('只在打开状态声明布局，避免关闭的透明列表拦截点击', async () => {
    expect(hasUnconditionalPopoverDisplayClass('<div popover="auto" class="grid" />')).toBe(true)
    expect(hasUnconditionalPopoverDisplayClass(await readFile(selectSourceUrl, 'utf8'))).toBe(false)
  })

  it('紧凑选项列表不叠加额外水平边距', async () => {
    expect(usesCompactSelectList('<div popover="auto" class="p-4px"><WuScrollArea size="sm">')).toBe(true)
    expect(
      usesCompactSelectList(
        '<div popover="auto" class="p-4px"><WuScrollArea size="sm" viewport-class="px-6px">',
      ),
    ).toBe(false)
    expect(usesCompactSelectList(await readFile(selectSourceUrl, 'utf8'))).toBe(true)
  })

  it('为小尺寸容器提供更窄且更贴边的滚动条', async () => {
    const compactFixture = [
      "size?: 'md' | 'sm'",
      "'bottom-1px right-0 top-1px w-4px'",
      "'w-2px'",
    ].join('\n')
    expect(hasCompactScrollbarVariant(compactFixture)).toBe(true)
    expect(hasCompactScrollbarVariant("size?: 'md'")).toBe(false)
    expect(hasCompactScrollbarVariant(await readFile(scrollAreaSourceUrl, 'utf8'))).toBe(true)
  })
})
