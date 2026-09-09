import { describe, expect, it } from 'vitest'
import { createExportLayout } from '../src/route/export-layout.ts'
import { createFullExportLayouts, EXPORT_SIZE_ERROR, JPEG_MAX_SIDE } from '../src/route/full-export-layout.ts'
import type { RoutePoint } from '../src/domain/types.ts'

function layout(count: number, mixed = false) {
  const points = Array.from({ length: count }, (_, index) => {
    const point: RoutePoint = { id: String(index), name: '声骸', echoId: null, stateId: 8, levelId: null, coordinate: { x: index * 1000, y: 0, z: 0 }, mapCoordinate: [index * 1000, 0] }
    const start: RoutePoint = { ...point, id: `start-${index}`, mapCoordinate: mixed && index % 3 === 0 ? [point.mapCoordinate[0] - 900, 0] : [point.mapCoordinate[0], -600] }
    return { ...point, teleportFrom: start }
  })
  return createExportLayout({ points, startPointId: null, algorithm: 'exact', totalCost: 0 })
}

describe('fixed two-column route image parts', () => {
  it('keeps one image when the complete two-column layout fits', () => {
    const source = layout(50)
    const before = structuredClone(source)
    const [full] = createFullExportLayouts(source)
    if (!full) throw new Error('完整路线图缺失')
    expect(full.width).toBe(1600)
    expect(full.height).toBeLessThanOrEqual(JPEG_MAX_SIDE)
    expect(full.columns).toBe(2)
    expect(full.positions.map(({ cardNumber }) => cardNumber)).toEqual(source.cards.map(({ number }) => number))
    expect(source).toEqual(before)
  })

  it.each([false, true])('adds images instead of columns without dropping or overlapping cards (wide cards: %s)', (mixed) => {
    const source = layout(120, mixed)
    const before = structuredClone(source)
    const parts = createFullExportLayouts(source, { maxHeight: 12000 })
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every(({ width, height, columns }) => width === 1600 && height <= 12000 && columns === 2)).toBe(true)
    expect(parts.flatMap(({ positions }) => positions.map(({ cardNumber }) => cardNumber))).toEqual(source.cards.map(({ number }) => number))
    const cards = new Map(source.cards.map((card) => [card.number, card]))
    for (const part of parts) {
      const rectangles = part.positions.map((position) => ({ ...cards.get(position.cardNumber), ...position }))
      for (const card of rectangles) {
        expect(card.x + (card.width ?? 0)).toBeLessThanOrEqual(part.width)
        expect(card.y + (card.height ?? 0)).toBeLessThanOrEqual(part.height)
        expect(rectangles.filter((other) => other.cardNumber !== card.cardNumber && other.x < card.x + (card.width ?? 0) && other.x + (other.width ?? 0) > card.x
          && other.y < card.y + (card.height ?? 0) && other.y + (other.height ?? 0) > card.y)).toHaveLength(0)
      }
    }
    expect(source).toEqual(before)
  })

  it('repeats the active area banner at the top of every continuation image', () => {
    const source = layout(24)
    for (const card of source.cards) {
      card.routeGroupId = 'huanglong-jinzhou'
      card.groupLabel = '瑝珑-今州'
      card.mapName = '地表地图'
    }
    const parts = createFullExportLayouts(source, { maxHeight: 4000 })
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(part.banners[0]).toMatchObject({ routeGroupId: 'huanglong-jinzhou', label: '瑝珑-今州', x: 0, y: 0, width: 1600 })
    }
  })

  it('fails only when one card and its banner cannot fit a single image', () => {
    const source = layout(4)
    expect(() => createFullExportLayouts(source, { maxHeight: 100 })).toThrow(EXPORT_SIZE_ERROR)
  })
})
