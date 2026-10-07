import type { GravityType, MapStateDefinition } from '../domain/types.ts'
import { gameToMapCoordinate, layeredTileExtent, parseTileId, MAP_TILE_SIZE } from './projection.ts'

export function hitsMapTile(
  state: MapStateDefinition,
  coordinate: readonly [number | null, number | null],
  gravity: GravityType | null,
  levelId: string | null = null,
): boolean {
  if (coordinate.every((value) => value === null)
    || !coordinate.every((value) => value === null || Number.isFinite(value))) return false
  const [x, y] = gameToMapCoordinate(coordinate[0] ?? 0, coordinate[1] ?? 0)
  // Projection arithmetic can move an exact tile edge by a few floating-point units.
  const tolerance = Number.EPSILON * Math.max(MAP_TILE_SIZE, Math.abs(x), Math.abs(y)) * 8
  const contains = (extent: readonly [number, number, number, number] | null) => extent !== null
    && (coordinate[0] === null || x >= extent[0] - tolerance && x <= extent[2] + tolerance)
    && (coordinate[1] === null || y >= extent[1] - tolerance && y <= extent[3] + tolerance)
  if (levelId !== null) {
    const floor = state.layeredMaps.flatMap(({ floors }) => floors).find(({ id }) => id === levelId)
    return floor?.tiles.some((path) => contains(layeredTileExtent(path))) ?? false
  }
  if (gravity === 2) return state.gravityTiles.some((path) => contains(layeredTileExtent(path)))
  return state.tileIds.some((id) => {
    const tile = parseTileId(id)
    return tile !== null && contains([tile.x * MAP_TILE_SIZE, (tile.y - 1) * MAP_TILE_SIZE, (tile.x + 1) * MAP_TILE_SIZE, tile.y * MAP_TILE_SIZE])
  })
}
