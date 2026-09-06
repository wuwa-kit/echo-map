import { createEmpty, extend, isEmpty } from 'ol/extent.js'
import type { Extent } from 'ol/extent.js'
import type { MapFloorDefinition, MapStateDefinition } from '../domain/types.ts'
import { layeredTileExtent } from './projection.ts'

export function floorExtent(floor: MapFloorDefinition | undefined, tileWidth: number): Extent | null {
  const extent = createEmpty()
  for (const path of floor?.tiles ?? []) {
    const tile = layeredTileExtent(path, tileWidth)
    if (tile) extend(extent, tile)
  }
  return isEmpty(extent) ? null : extent
}

export function createFloorCoverage(state: MapStateDefinition | null, tileWidth: number) {
  return (state?.layeredMaps ?? []).map((group) => ({
    id: group.id,
    tiles: group.coverage.flatMap((tile) => {
      const extent = layeredTileExtent(tile.tile, tileWidth)
      return extent ? [{ ...tile, extent }] : []
    }),
  }))
}

type Coverage = ReturnType<typeof createFloorCoverage>

function tileFocusScore(tile: Coverage[number]['tiles'][number], center: readonly [number, number], radius: number) {
  const { extent: [left, bottom, right, top], size, runs } = tile
  if (center[0] + radius < left || center[0] - radius >= right || center[1] + radius <= bottom || center[1] - radius > top) return null
  const scale = (right - left) / size
  const x = (center[0] - left) / scale
  const y = (top - center[1]) / scale
  const reach = radius / scale
  const minX = Math.max(0, x - reach)
  const maxX = Math.min(size, x + reach)
  const firstRow = Math.max(0, Math.floor(y - reach))
  const lastRow = Math.min(size - 1, Math.floor(y + reach))
  const firstPixel = firstRow * size
  let low = 0
  let high = runs.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((runs[middle]?.[1] ?? 0) <= firstPixel) low = middle + 1
    else high = middle
  }

  let distanceSquared = Infinity
  let area = 0
  let containsCenter = false
  // Intersect compressed intervals with the focus window, never sample image pixels.
  for (let index = low; index < runs.length; index++) {
    const run = runs[index]
    if (!run || run[0] >= (lastRow + 1) * size) break
    const startRow = Math.max(firstRow, Math.floor(run[0] / size))
    const endRow = Math.min(lastRow, Math.floor((run[1] - 1) / size))
    for (let row = startRow; row <= endRow; row++) {
      const start = Math.max(0, run[0] - row * size)
      const end = Math.min(size, run[1] - row * size)
      if (end < minX || start > maxX) continue
      const dx = Math.max(start - x, 0, x - end)
      const dy = Math.max(row - y, 0, y - row - 1)
      distanceSquared = Math.min(distanceSquared, (dx * dx + dy * dy) * scale * scale)
      area += Math.max(0, Math.min(end, maxX) - Math.max(start, minX))
        * Math.max(0, Math.min(row + 1, y + reach) - Math.max(row, y - reach)) * scale * scale
      if (x >= start && x < end && y >= row && y < row + 1) containsCenter = true
    }
  }
  if (radius === 0 ? !containsCenter : distanceSquared > radius * radius) return null
  return { distanceSquared, area }
}

export function floorGroupsNearCenter(coverage: Coverage, center: readonly [number, number] | null, radius: number): string[] {
  if (!center || !center.every(Number.isFinite) || !Number.isFinite(radius) || radius < 0) return []
  return coverage.flatMap((group) => {
    let distanceSquared = Infinity
    let area = 0
    for (const tile of group.tiles) {
      const score = tileFocusScore(tile, center, radius)
      if (!score) continue
      distanceSquared = Math.min(distanceSquared, score.distanceSquared)
      area += score.area
    }
    return Number.isFinite(distanceSquared) ? [{ id: group.id, distanceSquared, area }] : []
  }).sort((left, right) => left.distanceSquared - right.distanceSquared || right.area - left.area)
    .map(({ id }) => id)
}

export function floorGroupAtCenter(coverage: Coverage, center: readonly [number, number] | null, radius = 0): string | null {
  return floorGroupsNearCenter(coverage, center, radius)[0] ?? null
}
