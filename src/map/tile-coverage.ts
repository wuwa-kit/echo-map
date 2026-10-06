import type { GravityType, MapStateDefinition } from '../domain/types.ts'
import { gameToMapCoordinate, layeredTileExtent, parseTileId } from './projection.ts'

export function hitsMapTile(
  state: MapStateDefinition,
  tileWidth: number,
  coordinate: readonly [number | null, number | null],
  gravity: GravityType | null,
  levelId: string | null = null,
): boolean {
  if (coordinate.every((value) => value === null)
    || !coordinate.every((value) => value === null || Number.isFinite(value))
    || !Number.isFinite(tileWidth) || tileWidth <= 0) return false
  const [x, y] = gameToMapCoordinate(coordinate[0] ?? 0, coordinate[1] ?? 0, tileWidth)
  // Projection arithmetic can move an exact tile edge by a few floating-point units.
  const tolerance = Number.EPSILON * Math.max(tileWidth, Math.abs(x), Math.abs(y)) * 8
  const contains = (extent: readonly [number, number, number, number] | null) => extent !== null
    && (coordinate[0] === null || x >= extent[0] - tolerance && x <= extent[2] + tolerance)
    && (coordinate[1] === null || y >= extent[1] - tolerance && y <= extent[3] + tolerance)
  if (levelId !== null) {
    const floor = state.layeredMaps.flatMap(({ floors }) => floors).find(({ id }) => id === levelId)
    return floor?.tiles.some((path) => contains(layeredTileExtent(path, tileWidth))) ?? false
  }
  if (gravity === 2) return state.gravityTiles.some((path) => contains(layeredTileExtent(path, tileWidth)))
  return state.tileIds.some((id) => {
    const tile = parseTileId(id)
    return tile !== null && contains([tile.x * tileWidth, (tile.y - 1) * tileWidth, (tile.x + 1) * tileWidth, tile.y * tileWidth])
  })
}
