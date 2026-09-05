import { describe, expect, it } from 'vitest'
import { fitMapPadding } from '../src/map/viewport-padding.ts'

describe('map fit padding', () => {
  it('preserves measured panel insets when enough map space remains', () => {
    expect(fitMapPadding(1280, 800, [16, 685, 16, 16])).toEqual([16, 685, 16, 16])
    expect(fitMapPadding(390, 844, [16, 16, 675, 16])).toEqual([16, 16, 675, 16])
  })

  it.each([[320, 568], [390, 300], [844, 390], [100, 80], [0, 0]])('keeps a usable area at %s × %s, including keyboard occlusion', (width, height) => {
    const [top, right, bottom, left] = fitMapPadding(width, height, [96, 360, 700, 96])
    expect(width - right - left).toBeGreaterThanOrEqual(Math.min(96, width / 2) - 0.001)
    expect(height - top - bottom).toBeGreaterThanOrEqual(Math.min(96, height / 2) - 0.001)
    expect([top, right, bottom, left].every((value) => Number.isFinite(value) && value >= 0)).toBe(true)
  })

  it('ignores nonfinite and negative measurements during layout transitions', () => {
    expect(fitMapPadding(390, 844, [NaN, -10, Infinity, 16])).toEqual([0, 0, 0, 16])
  })
})
