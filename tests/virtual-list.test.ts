import { describe, expect, it } from 'vitest'
import { virtualListWindow } from '../src/utils/virtual-list.ts'

describe('virtual list window', () => {
  it.each([72, 168, 192])('reaches every record with bounded rendering at row height %s', rowHeight => {
    const count = 10000
    const viewport = 600
    const first = virtualListWindow(count, rowHeight, 0, viewport)
    const middle = virtualListWindow(count, rowHeight, rowHeight * 4321, viewport)
    const last = virtualListWindow(count, rowHeight, count * rowHeight - viewport, viewport)
    expect(first.start).toBe(0)
    expect(middle.start).toBeLessThanOrEqual(4321)
    expect(middle.end).toBeGreaterThan(4321)
    expect(last.end).toBe(count)
    for (const window of [first, middle, last]) {
      expect(window.end - window.start).toBeLessThanOrEqual(Math.ceil(viewport / rowHeight) + 9)
      expect(window.before + (window.end - window.start) * rowHeight + window.after).toBe(count * rowHeight)
    }
  })

  it('keeps short and empty results visible after filtering while scrolled to the end', () => {
    expect(virtualListWindow(0, 72, 900000, 600)).toEqual({ start: 0, end: 0, height: 0, before: 0, after: 0 })
    expect(virtualListWindow(3, 72, 900000, 600)).toMatchObject({ start: 0, end: 3, before: 0, after: 0 })
    expect(virtualListWindow(1000, 72, -800, 600).start).toBe(0)
    expect(virtualListWindow(1000, 72, 900000, 600).end).toBe(1000)
  })
})
