import { describe, expect, it } from 'vitest'
import { createExportLayout, EXPORT_GAP, EXPORT_MARGIN } from '../src/route/export-layout.ts'
import { createFullExportLayout, EXPORT_SIZE_ERROR, JPEG_MAX_SIDE } from '../src/route/full-export-layout.ts'
import type { RoutePoint } from '../src/domain/types.ts'

function layout(count: number, mixed = false) {
  const points = Array.from({ length: count }, (_, index) => {
    const point: RoutePoint = { id: String(index), name: '声骸', echoId: null, stateId: 8, levelId: null, coordinate: { x: index * 1000, y: 0, z: 0 }, mapCoordinate: [index * 1000, 0] }
    const start: RoutePoint = { ...point, id: `start-${index}`, mapCoordinate: mixed && index % 3 === 0 ? [point.mapCoordinate[0] - 900, 0] : [point.mapCoordinate[0], -600] }
    return { ...point, teleportFrom: start }
  })
  return createExportLayout({ points, startPointId: null, algorithm: 'exact', totalCost: 0 })
}

describe('adaptive columns for the full JPG', () => {
  it('continues each column across mobile page boundaries without restarting on the left', () => {
    const points = Array.from({ length: 18 }, (_, index) => {
      const point: RoutePoint = { id: String(index), name: '声骸', echoId: null, stateId: 8, levelId: null, coordinate: { x: index * 1000, y: 0, z: 0 }, mapCoordinate: [index * 1000, 0] }
      return { ...point, teleportFrom: { ...point, id: `start-${index}`, mapCoordinate: [point.mapCoordinate[0] - 10, -(index % 3 === 0 ? 180 : 40)] satisfies [number, number] } }
    })
    const source = createExportLayout({ points, startPointId: null, algorithm: 'exact', totalCost: 0 })
    expect(source.pages.length).toBeGreaterThan(1)
    const before = structuredClone(source)
    const full = createFullExportLayout(source)
    expect(full.columns).toBe(2)
    const placed = source.cards.map((card, index) => ({ ...card, ...full.positions[index] }))
    for (const [index, card] of placed.entries()) {
      const above = placed.slice(0, index).filter(({ x }) => x === card.x)
      const bottom = above.length ? Math.max(...above.map(({ y, height }) => y + height)) : EXPORT_MARGIN - EXPORT_GAP
      expect(card.y - bottom).toBeGreaterThanOrEqual(EXPORT_GAP - 1)
      expect(card.y - bottom).toBeLessThanOrEqual(EXPORT_GAP)
      if (index > 0) expect(card.y).toBeGreaterThanOrEqual(placed[index - 1]?.y ?? 0)
    }
    expect(source.pages.slice(1).some(({ cards }) => full.positions[(cards[0]?.number ?? 1) - 1]?.x !== EXPORT_MARGIN)).toBe(true)
    expect(source).toEqual(before)
  })

  it('keeps two columns when the continuously packed pixels fit the format boundary', () => {
    for (const height of [33518, JPEG_MAX_SIDE]) {
      const source = layout(4)
      const firstRowHeight = Math.floor((height - EXPORT_MARGIN * 2 - EXPORT_GAP) / 2)
      for (const [index, card] of source.cards.entries()) {
        card.height = index < 2 ? firstRowHeight : height - EXPORT_MARGIN * 2 - EXPORT_GAP - firstRowHeight
      }
      const full = createFullExportLayout(source)
      expect(full.width).toBe(1600)
      expect(full.height).toBe(height)
      expect(full.columns).toBe(2)
      expect(full.positions).toHaveLength(4)
    }
  })

  it.each([false, true])('adds columns without stretching, dropping or overlapping cards (wide cards: %s)', (mixed) => {
    const source = layout(120, mixed)
    const before = structuredClone(source)
    expect(source.height).toBeGreaterThan(JPEG_MAX_SIDE)
    const full = createFullExportLayout(source)
    expect(full.columns).toBeGreaterThan(2)
    expect(full.width).toBeGreaterThan(1600)
    expect(Math.max(full.width, full.height)).toBeLessThanOrEqual(JPEG_MAX_SIDE)
    expect(full.positions).toHaveLength(source.cards.length)
    const rectangles = source.cards.map((card, index) => ({ ...card, ...full.positions[index] }))
    for (const card of rectangles) {
      expect(card.x + card.width).toBeLessThanOrEqual(full.width)
      expect(card.y + card.height).toBeLessThanOrEqual(full.height)
      expect(rectangles.filter((other) => other.number !== card.number && other.x < card.x + card.width && other.x + other.width > card.x
        && other.y < card.y + card.height && other.y + other.height > card.y)).toHaveLength(0)
    }
    expect(source).toEqual(before)
    expect(source.pages.flatMap(({ cards }) => cards.map(({ number }) => number))).toEqual(source.cards.map((_, index) => index + 1))
  })

  it('reflows for a lower browser limit and fails explicitly when no column count fits', () => {
    const source = layout(50)
    expect(source.height).toBeGreaterThan(32767)
    const full = createFullExportLayout(source, { maxSide: 32767 })
    expect(full.columns).toBe(3)
    expect(full.height).toBeLessThanOrEqual(32767)
    expect(() => createFullExportLayout(source, { maxSide: 2000 })).toThrow(EXPORT_SIZE_ERROR)
    expect(() => createFullExportLayout(layout(5000))).toThrow(EXPORT_SIZE_ERROR)
  })
})
