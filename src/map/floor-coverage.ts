import { createEmpty, extend, isEmpty } from 'ol/extent.js'
import type { Extent } from 'ol/extent.js'
import type { MapFloorDefinition, MapStateDefinition } from '../domain/types.ts'
import { layeredTileExtent } from './projection.ts'

export function floorExtent(floor: MapFloorDefinition | undefined): Extent | null {
  const extent = createEmpty()
  for (const path of floor?.tiles ?? []) {
    const tile = layeredTileExtent(path)
    if (tile) extend(extent, tile)
  }
  return isEmpty(extent) ? null : extent
}

export function createFloorCoverage(state: MapStateDefinition | null) {
  return (state?.layeredMaps ?? []).map((group) => ({
    id: group.id,
    floors: group.floors,
    tiles: group.coverage.flatMap((tile) => {
      const extent = layeredTileExtent(tile.tile)
      return extent ? [{ ...tile, extent }] : []
    }),
  }))
}

type Coverage = ReturnType<typeof createFloorCoverage>

function tileContainsCoordinate(tile: Coverage[number]['tiles'][number], [x, y]: readonly [number, number]): boolean {
  const { extent: [left, bottom, right, top], size, runs } = tile
  if (x < left || x >= right || y <= bottom || y > top) return false
  const column = Math.floor((x - left) * size / (right - left))
  const row = Math.floor((top - y) * size / (top - bottom))
  const pixel = row * size + column
  let low = 0
  let high = runs.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((runs[middle]?.[1] ?? 0) <= pixel) low = middle + 1
    else high = middle
  }
  const run = runs[low]
  return Boolean(run && run[0] <= pixel && pixel < run[1])
}

export function floorsAtCoordinate(coverage: Coverage, coordinate: readonly [number, number] | null): MapFloorDefinition[] {
  if (!coordinate || !coordinate.every(Number.isFinite)) return []
  return coverage.flatMap((group) => {
    const tiles = new Set(group.tiles.filter((tile) => tileContainsCoordinate(tile, coordinate)).map(({ tile }) => tile))
    return group.floors.filter((floor) => floor.tiles.some((path) => tiles.has(path.split('/').at(-1) ?? '')))
  })
}

function tileIntersectsViewport(tile: Coverage[number]['tiles'][number], viewport: readonly [number, number, number, number]): boolean {
  const { extent: [left, bottom, right, top], size, runs } = tile
  const clippedLeft = Math.max(left, viewport[0])
  const clippedBottom = Math.max(bottom, viewport[1])
  const clippedRight = Math.min(right, viewport[2])
  const clippedTop = Math.min(top, viewport[3])
  if (clippedLeft >= clippedRight || clippedBottom >= clippedTop) return false

  const scale = (right - left) / size
  const firstColumn = Math.max(0, Math.floor((clippedLeft - left) / scale))
  const lastColumn = Math.min(size, Math.ceil((clippedRight - left) / scale))
  const firstRow = Math.max(0, Math.floor((top - clippedTop) / scale))
  const lastRow = Math.min(size, Math.ceil((top - clippedBottom) / scale))
  if (firstColumn >= lastColumn || firstRow >= lastRow) return false

  const firstPixel = firstRow * size + firstColumn
  let low = 0
  let high = runs.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((runs[middle]?.[1] ?? 0) <= firstPixel) low = middle + 1
    else high = middle
  }

  let runIndex = low
  for (let row = firstRow; row < lastRow; row++) {
    const rowStart = row * size + firstColumn
    const rowEnd = row * size + lastColumn
    while (runIndex < runs.length && (runs[runIndex]?.[1] ?? 0) <= rowStart) runIndex++
    const run = runs[runIndex]
    if (run && run[0] < rowEnd && run[1] > rowStart) return true
  }
  return false
}

export function floorGroupsInViewport(coverage: Coverage, extent: Extent | null): string[] {
  const [left, bottom, right, top] = extent ?? []
  if (left === undefined || bottom === undefined || right === undefined || top === undefined
    || ![left, bottom, right, top].every(Number.isFinite) || left >= right || bottom >= top) return []
  const viewport: [number, number, number, number] = [left, bottom, right, top]
  return coverage.filter((group) => group.tiles.some((tile) => tileIntersectsViewport(tile, viewport)))
    .map(({ id }) => id)
}
