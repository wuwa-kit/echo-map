import { describe, expect, it } from 'vitest'
import { assetGridWindow } from '../src/domain/asset-grid.ts'

describe('asset grid virtualization', () => {
  it('bounds rendered cards and reaches the final partial row', () => {
    const first = assetGridWindow(1323, 1000, -300, 800)
    expect(first.start).toBe(0)
    expect(first.end).toBeLessThan(30)
    const last = assetGridWindow(1323, 1000, first.height - 800, 800)
    expect(last.end).toBe(1323)
    expect(last.start).toBeGreaterThan(1280)
    expect(last.offset).toBeLessThan(first.height)
  })

  it('handles empty results, offscreen grids and responsive column counts', () => {
    expect(assetGridWindow(0, 400, 0, 800)).toMatchObject({ start: 0, end: 0, height: 0 })
    expect(assetGridWindow(100, 400, -2000, 800)).toMatchObject({ start: 0, end: 0 })
    expect([360, 600, 900, 1300].map((width) => assetGridWindow(100, width, 0, 800).columns)).toEqual([2, 3, 4, 6])
  })
})
