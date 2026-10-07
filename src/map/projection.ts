import type { OfficialCoordinate, TileExtent } from '../domain/types.ts'

export const MAP_TILE_SIZE = 850
export const GAME_COORDINATE_RATE = 100

export function officialToMapCoordinate(
  rawX: number,
  rawY: number,
): OfficialCoordinate {
  return {
    rawX,
    rawY,
    mapX: rawX / GAME_COORDINATE_RATE + MAP_TILE_SIZE,
    mapY: -(rawY / GAME_COORDINATE_RATE),
  }
}

export function gameToMapCoordinate(x: number, y: number): [number, number] {
  const converted = officialToMapCoordinate(x * GAME_COORDINATE_RATE, y * GAME_COORDINATE_RATE)
  return [converted.mapX, converted.mapY]
}

export function mapToGameCoordinate(mapX: number, mapY: number): [number, number] {
  const gameX = mapX - MAP_TILE_SIZE
  const gameY = -mapY
  return [gameX === 0 ? 0 : gameX, gameY === 0 ? 0 : gameY]
}

export function parseTileId(tileId: string): { x: number; y: number } | null {
  const match = tileId.match(/^\d+_(-?\d+)_(-?\d+)$/)
  if (!match?.[1] || !match[2]) {
    return null
  }

  return { x: Number(match[1]), y: Number(match[2]) }
}

export function calculateTileExtent(tileIds: string[]): TileExtent {
  const coordinates = tileIds.map(parseTileId).filter((value) => value !== null)
  if (coordinates.length === 0) {
    return {
      minTileX: -1,
      minTileY: 0,
      maxTileX: 0,
      maxTileY: 1,
      extent: [-MAP_TILE_SIZE, -MAP_TILE_SIZE, MAP_TILE_SIZE, MAP_TILE_SIZE],
    }
  }

  const xs = coordinates.map(({ x }) => x)
  const ys = coordinates.map(({ y }) => y)
  const minTileX = Math.min(...xs)
  const maxTileX = Math.max(...xs)
  const minTileY = Math.min(...ys)
  const maxTileY = Math.max(...ys)

  return {
    minTileX,
    minTileY,
    maxTileX,
    maxTileY,
    extent: [
      minTileX * MAP_TILE_SIZE,
      (minTileY - 1) * MAP_TILE_SIZE,
      (maxTileX + 1) * MAP_TILE_SIZE,
      maxTileY * MAP_TILE_SIZE,
    ],
  }
}

export function layeredTileExtent(tilePath: string): [number, number, number, number] | null {
  const match = tilePath.match(/(-?\d+)_(-?\d+)\.png$/)
  if (!match?.[1] || !match[2]) {
    return null
  }

  const x = Number(match[1])
  const y = Number(match[2])
  return [x * MAP_TILE_SIZE, (y - 1) * MAP_TILE_SIZE, (x + 1) * MAP_TILE_SIZE, y * MAP_TILE_SIZE]
}
