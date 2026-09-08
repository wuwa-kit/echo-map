import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { elementHasOverflow } from '../src/components/base/ellipsis.ts'
import { tooltipPosition } from '../src/components/base/tooltip-position.ts'

const tooltipSourceUrl = new URL('../src/components/base/WuTooltip.vue', import.meta.url)
const ellipsisSourceUrl = new URL('../src/components/base/WuEllipsis.vue', import.meta.url)
const floorSwitcherSourceUrl = new URL('../src/components/FloorSwitcher.vue', import.meta.url)

describe('WuTooltip positioning', () => {
  const anchor = { left: 100, top: 100, width: 50, height: 20 }
  const viewport = { left: 0, top: 0, width: 500, height: 400 }
  const size = { width: 80, height: 30 }

  it.each([
    ['top', 85, 62],
    ['right', 158, 95],
    ['bottom', 85, 128],
    ['left', 12, 95],
  ] as const)('places content on the %s side', (placement, left, top) => {
    expect(tooltipPosition({ anchor, viewport, size, placement, gap: 8, margin: 12 })).toEqual({ left, top })
  })

  it('flips away from a blocked side and clamps to the visual viewport', () => {
    const edgeAnchor = { left: 4, top: 4, width: 20, height: 20 }
    expect(tooltipPosition({ anchor: edgeAnchor, viewport, size, placement: 'top', gap: 8, margin: 12 })).toEqual({ left: 12, top: 32 })
    expect(tooltipPosition({ anchor: edgeAnchor, viewport, size, placement: 'left', gap: 8, margin: 12 })).toEqual({ left: 32, top: 12 })
    expect(tooltipPosition({
      anchor: { left: 260, top: 120, width: 30, height: 20 },
      viewport: { left: 100, top: 50, width: 200, height: 100 },
      size, placement: 'right', gap: 8, margin: 12,
    })).toEqual({ left: 172, top: 108 })
  })
})

describe('WuEllipsis overflow detection', () => {
  it('uses a subpixel tolerance for horizontal and vertical overflow', () => {
    expect(elementHasOverflow({ clientWidth: 100, scrollWidth: 100.5, clientHeight: 20, scrollHeight: 20 })).toBe(false)
    expect(elementHasOverflow({ clientWidth: 100, scrollWidth: 100.51, clientHeight: 20, scrollHeight: 20 })).toBe(true)
    expect(elementHasOverflow({ clientWidth: 100, scrollWidth: 100, clientHeight: 20, scrollHeight: 20.51 })).toBe(true)
  })

  it('uses a manual popover only for actual overflow and replaces the floor switcher hint', async () => {
    const tooltipSource = await readFile(tooltipSourceUrl, 'utf8')
    const ellipsisSource = await readFile(ellipsisSourceUrl, 'utf8')
    const floorSwitcherSource = await readFile(floorSwitcherSourceUrl, 'utf8')
    expect(tooltipSource).toContain('popover="manual"')
    expect(tooltipSource).toContain("event?.pointerType === 'touch'")
    expect(tooltipSource).not.toMatch(/aria-|\brole=|tabindex/)
    expect(ellipsisSource).toContain(':disabled="!overflowing"')
    expect(ellipsisSource).toContain('elementHasOverflow(element)')
    expect(floorSwitcherSource).toContain("import WuTooltip from './base/WuTooltip.vue'")
    expect(floorSwitcherSource).toContain("import WuEllipsis from './base/WuEllipsis.vue'")
    expect(floorSwitcherSource).toContain("import WuScrollArea from './base/WuScrollArea.vue'")
    expect(floorSwitcherSource).toContain('<WuScrollArea size="sm"')
    expect(floorSwitcherSource).not.toContain('overflow-y-auto overscroll-contain')
    expect(floorSwitcherSource).toContain("compactFloors ? 'w-56px")
    expect(floorSwitcherSource).toContain(": 'w-max rounded-9px'")
    expect(floorSwitcherSource).not.toContain('w-176px')
    expect(floorSwitcherSource).not.toContain('w-[calc(100%_-_36px)]')
    expect(floorSwitcherSource).toContain("'right-4px top-4px h-36px w-32px rounded-6px border-0 bg-transparent'")
    expect(floorSwitcherSource).toContain(':tooltip-text="floorHint(group.name, floor.name, floor.id)"')
    expect(floorSwitcherSource).not.toContain('flex-1 truncate')
    expect(floorSwitcherSource).not.toContain('showHint')
  })
})
