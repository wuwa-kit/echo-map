import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const selectSourceUrl = new URL('../src/components/base/WuSelect.vue', import.meta.url)
const optionSourceUrl = new URL('../src/components/base/WuOption.vue', import.meta.url)
const popoverSourceUrl = new URL('../src/components/base/WuPopover.vue', import.meta.url)
const scrollAreaSourceUrl = new URL('../src/components/base/WuScrollArea.vue', import.meta.url)
const multiSelectSourceUrl = new URL('../src/components/base/WuMultiSelect.vue', import.meta.url)
const overflowRowSourceUrl = new URL('../src/components/base/WuOverflowRow.vue', import.meta.url)

function hasUnconditionalPopoverDisplayClass(source: string): boolean {
  const popoverTag = source.match(/<div(?=[^>]*\bpopover="auto")[^>]*>/s)?.[0]
  if (!popoverTag) {
    throw new Error('未找到原生 Popover 容器')
  }
  const classNames = popoverTag.match(/\bclass="([^"]*)"/)?.[1] ?? ''
  return /(?:^|\s)(?:block|flex|grid|inline|inline-block|inline-flex|inline-grid)(?:\s|$)/.test(classNames)
}

function usesCompactSelectList(source: string): boolean {
  const popoverTag = source.match(/<WuPopover\b[^>]*>/s)?.[0] ?? ''
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

function usesAdaptiveMultiSelectSummary(multiSelectSource: string, overflowRowSource: string): boolean {
  return multiSelectSource.includes("import WuOverflowRow from './WuOverflowRow.vue'")
    && (multiSelectSource.match(/<WuOverflowRow\b/g)?.length ?? 0) === 2
    && overflowRowSource.includes('useResizeObserver([container, itemList, suffixList]')
    && overflowRowSource.includes('container.value.scrollWidth > container.value.clientWidth')
    && overflowRowSource.includes('child.offsetTop !== firstItem.offsetTop')
    && overflowRowSource.includes('visibleCount.value -= 1')
    && overflowRowSource.includes(':hidden-count="hiddenCount"')
    && !multiSelectSource.includes('maxSummaryIcons')
}

function supportsLocalMultiSelectSearch(source: string): boolean {
  return source.includes('searchPlaceholder?: string')
    && source.includes("searchQuery.value.trim().toLocaleLowerCase()")
    && source.includes('label.toLocaleLowerCase().includes(search)')
    && source.includes('v-for="option in filteredOptions"')
    && source.includes("searchQuery.value = ''")
}

describe('WuSelect Popover', () => {
  it('选择器和选项完全由 WuPopover 与 div 实现', async () => {
    const selectSource = await readFile(selectSourceUrl, 'utf8')
    const optionSource = await readFile(optionSourceUrl, 'utf8')
    const combinedSource = `${selectSource}\n${optionSource}`

    expect(selectSource).toContain('<WuPopover')
    expect(selectSource).not.toMatch(/<(?:select|option|button)\b/)
    expect(optionSource).toContain('<div')
    expect(optionSource).not.toMatch(/<(?:select|option|button)\b/)
    expect(combinedSource).not.toContain('native?:')
    expect(combinedSource).not.toContain('@keydown')
  })

  it('只在打开状态声明布局，避免关闭的透明列表拦截点击', async () => {
    expect(hasUnconditionalPopoverDisplayClass('<div popover="auto" class="grid" />')).toBe(true)
    expect(hasUnconditionalPopoverDisplayClass(await readFile(popoverSourceUrl, 'utf8'))).toBe(false)
  })

  it('紧凑选项列表不叠加额外水平边距', async () => {
    expect(usesCompactSelectList('<WuPopover class="p-4px"><WuScrollArea size="sm">')).toBe(true)
    expect(
      usesCompactSelectList(
        '<WuPopover class="p-4px"><WuScrollArea size="sm" viewport-class="px-6px">',
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

  it('多选摘要按实际可用宽度展示图标并为剩余数量留位', async () => {
    const multiSelectSource = await readFile(multiSelectSourceUrl, 'utf8')
    const overflowRowSource = await readFile(overflowRowSourceUrl, 'utf8')
    expect(usesAdaptiveMultiSelectSummary(multiSelectSource, overflowRowSource)).toBe(true)
    expect(usesAdaptiveMultiSelectSummary(`${multiSelectSource}\nconst maxSummaryIcons = 6`, overflowRowSource)).toBe(false)
  })

  it('多选搜索仅过滤选项并在关闭弹层后清空', async () => {
    const multiSelectSource = await readFile(multiSelectSourceUrl, 'utf8')
    expect(supportsLocalMultiSelectSearch(multiSelectSource)).toBe(true)
    expect(multiSelectSource).toContain('没有匹配的{{ label }}')
    expect(multiSelectSource).not.toContain('清空已选')
    const triggerSource = multiSelectSource.slice(
      multiSelectSource.indexOf('<WuPopover'),
      multiSelectSource.indexOf('<WuScrollArea size="sm">'),
    )
    expect(triggerSource).toContain('<WuInput v-model="searchQuery"')
    expect(multiSelectSource).toContain('[&:popover-open]:overflow-visible')
    expect(multiSelectSource).toContain('bottom-[calc(100%+6px)]')
  })

  it('弹层顶部使用当前结果三态选择和自适应已选图标摘要', async () => {
    const multiSelectSource = await readFile(multiSelectSourceUrl, 'utf8')
    expect(multiSelectSource).toContain('<WuCheckBox')
    expect(multiSelectSource).toContain(':model-value="allCurrentSelected"')
    expect(multiSelectSource).toContain(':indeterminate="someCurrentSelected"')
    expect(multiSelectSource).toContain('{{ currentSelectedCount }} / {{ filteredOptions.length }}')
    expect(multiSelectSource).toContain('align="end"')
    expect(multiSelectSource).toContain('+{{ hiddenCount }}')
  })
})
