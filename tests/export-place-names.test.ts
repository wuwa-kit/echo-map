import { describe, expect, it } from 'vitest'
import { exportCardNumberBox, nearbyExportPlaces, placeExportNames } from '../src/map/export-place-names.ts'
import { createExportLayout } from '../src/route/export-layout.ts'
import type { RegionLabel } from '../src/domain/types.ts'

const [card] = createExportLayout({ points: [{ id: 'only', name: '声骸', echoId: null, stateId: 8, levelId: null, coordinate: { x: 0, y: 0, z: 0 }, mapCoordinate: [0, 0] }], algorithm: 'exact', startPointId: null, totalCost: 0 }).cards
if (!card) throw new Error('Missing export card')
const fixture = card
const measure = (text: string) => [...text].length * 10
function label(id: string, x: number, y: number, level = 3, stateId = 8, countryId = 1): RegionLabel {
  return { id, name: id, stateId, countryId, level, coordinate: { rawX: x, rawY: y, mapX: x, mapY: y } }
}

describe('nearby place references in cropped route images', () => {
  it('finds names outside the crop while excluding other maps and countries', () => {
    const labels = [label('附近山谷', 1000, 1000), label('遥远山谷', 5000, 5000), label('附近大区', -1200, 0, 2),
      label('另一地图', 0, 0, 3, 9), label('另一国家', 0, 0, 3, 8, 2), label('国家标签', 0, 0, 1)]
    const before = structuredClone(labels)
    const places = nearbyExportPlaces(labels, fixture, new Set([1]))
    expect(places.map(({ name }) => name)).toEqual(['附近山谷', '附近大区'])
    expect(places.every(({ outside }) => outside)).toBe(true)
    expect(labels).toEqual(before)
    const placed = placeExportNames(places, fixture, measure)
    expect(placed[0]?.text).toContain('附近山谷 ↗')
  })

  it('keeps every label in the image and clear of the lone echo', () => {
    const places = nearbyExportPlaces([label('目标附近', 0, 0), label('邻接地区', 600, 300, 2)], fixture, new Set([1]))
    expect(places[0]?.outside).toBe(false)
    const boxes = placeExportNames(places, fixture, measure)
    expect(boxes.length).toBeGreaterThan(0)
    const [width, height] = fixture.mapSize
    const pointX = width / 2, pointY = height / 2 + fixture.center[1] / fixture.resolution
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(box.y + box.height).toBeLessThanOrEqual(height)
      expect(box.x + box.width < pointX - 17 || box.x > pointX + 17 || box.y + box.height < pointY - 17 || box.y > pointY + 17).toBe(true)
    }
    const [first, second] = boxes
    if (first && second) expect(first.x + first.width <= second.x || second.x + second.width <= first.x || first.y + first.height <= second.y || second.y + second.height <= first.y).toBe(true)
  })

  it('does not borrow a region name from another map when a floor has no labels', () => {
    expect(nearbyExportPlaces([label('地表区域', 0, 0)], { ...fixture, stateId: 902 }, new Set())).toEqual([])
  })

  it('keeps names clear of the top-left image number even when their anchor is there', () => {
    for (const number of [1, 1000]) {
      const card = { ...fixture, number }
      const reserved = exportCardNumberBox(card)
      const boxes = placeExportNames([{ name: '附近地区', anchor: [0, 0], outside: true }], card, measure)
      expect(boxes).toHaveLength(1)
      for (const box of boxes) {
        expect(box.x >= reserved.x + reserved.width || box.x + box.width <= reserved.x
          || box.y >= reserved.y + reserved.height || box.y + box.height <= reserved.y).toBe(true)
      }
    }
  })
})
