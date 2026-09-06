import { describe, expect, it } from 'vitest'
import { popoverPosition, popoverWidth } from '../src/components/base/popover-position.ts'
import type { WuPopoverPlacement } from '../src/components/base/popover-position.ts'

const defaults = {
  anchor: { left: 400, top: 350, width: 100, height: 40 },
  viewport: { left: 0, top: 0, width: 1280, height: 720 },
  size: { width: 220, height: 180 },
  placement: 'bottom-start',
  gap: 8,
  margin: 12,
  maxHeight: 440,
} satisfies Parameters<typeof popoverPosition>[0]

describe('WuPopover positioning', () => {
  it('supports trigger, content, viewport and fixed widths within the viewport', () => {
    expect(popoverWidth('trigger', 110, 300, 390, 12)).toBe(110)
    expect(popoverWidth('content', 110, 300, 390, 12)).toBe(300)
    expect(popoverWidth('viewport', 110, 300, 390, 12)).toBe(366)
    expect(popoverWidth(630, 110, 300, 390, 12)).toBe(366)
    expect(popoverWidth(-20, 110, 300, 390, 12)).toBe(0)
  })

  it.each([
    ['bottom-start', 400, 398], ['bottom', 340, 398], ['bottom-end', 280, 398],
    ['top-start', 400, 162], ['top', 340, 162], ['top-end', 280, 162],
  ] satisfies [WuPopoverPlacement, number, number][])(
    'aligns %s to the trigger', (placement, left, top) => {
      expect(popoverPosition({ ...defaults, placement })).toMatchObject({ left, top })
    },
  )

  it('opens above a mobile bottom bar and clamps the horizontal position', () => {
    expect(popoverPosition({
      ...defaults,
      anchor: { left: 200, top: 783, width: 110, height: 50 },
      viewport: { left: 0, top: 0, width: 390, height: 844 },
      size: { width: 366, height: 440 },
    })).toEqual({ left: 12, top: 335, maxHeight: 440 })
  })

  it('flips a top placement when there is only room below', () => {
    expect(popoverPosition({
      ...defaults, placement: 'top-end', anchor: { ...defaults.anchor, top: 20 },
    })).toEqual({ left: 280, top: 68, maxHeight: 440 })
  })

  it('keeps the preferred side when the content fits and limits tall content to available room', () => {
    expect(popoverPosition(defaults)).toEqual({ left: 400, top: 398, maxHeight: 310 })
    expect(popoverPosition({ ...defaults, size: { width: 220, height: 440 } })).toEqual({
      left: 400, top: 12, maxHeight: 330,
    })
  })

  it('honors visual viewport offsets and reduced height when the on-screen keyboard is open', () => {
    expect(popoverPosition({
      ...defaults,
      anchor: { left: 350, top: 460, width: 100, height: 40 },
      viewport: { left: 40, top: 100, width: 390, height: 400 },
      size: { width: 366, height: 200 },
    })).toEqual({ left: 52, top: 252, maxHeight: 340 })
  })
})
