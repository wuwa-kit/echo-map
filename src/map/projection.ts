import type { OfficialCoordinate, TileExtent } from '../domain/types.ts'

export const TILE_WIDTH = 1024
export const GAME_COORDINATE_RATE = 100
export const OFFICIAL_SCALE_BASE = 850

export function officialToMapCoordinate(
  rawX: number,
  rawY: number,
  tileWidth = TILE_WIDTH,
): OfficialCoordinate {
  const scale = tileWidth / OFFICIAL_SCALE_BASE

  return {
    rawX,
    rawY,
    mapX: (rawX / GAME_COORDINATE_RATE) * scale + tileWidth,
    mapY: -(rawY / GAME_COORDINATE_RATE) * scale,
  }
}

export function gameToMapCoordinate(x: number, y: number, tileWidth = TILE_WIDTH): [number, number] {
  const converted = officialToMapCoordinate(x * GAME_COORDINATE_RATE, y * GAME_COORDINATE_RATE, tileWidth)
  return [converted.mapX, converted.mapY]
}

export function mapToGameCoordinate(mapX: number, mapY: number, tileWidth = TILE_WIDTH): [number, number] {
  const gameX = ((mapX - tileWidth) / tileWidth) * OFFICIAL_SCALE_BASE
  const gameY = (-mapY / tileWidth) * OFFICIAL_SCALE_BASE
  return [gameX === 0 ? 0 : gameX, gameY === 0 ? 0 : gameY]
}

export function parseTileId(tileId: string): { x: number; y: number } | null {
  const match = tileId.match(/^\d+_(-?\d+)_(-?\d+)$/)
  if (!match?.[1] || !match[2]) {
    return null
  }

  return { x: Number(match[1]), y: Number(match[2]) }
}

export function calculateTileExtent(tileIds: string[], tileWidth = TILE_WIDTH): TileExtent {
  const coordinates = tileIds.map(parseTileId).filter((value) => value !== null)
  if (coordinates.length === 0) {
    return {
      minTileX: -1,
      minTileY: 0,
      maxTileX: 0,
      maxTileY: 1,
      extent: [-tileWidth, -tileWidth, tileWidth, tileWidth],
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
      minTileX * tileWidth,
      (minTileY - 1) * tileWidth,
      (maxTileX + 1) * tileWidth,
      maxTileY * tileWidth,
    ],
  }
}

export function layeredTileExtent(tilePath: string, tileWidth = TILE_WIDTH): [number, number, number, number] | null {
  const match = tilePath.match(/(-?\d+)_(-?\d+)\.png$/)
  if (!match?.[1] || !match[2]) {
    return null
  }

  const x = Number(match[1])
  const y = Number(match[2])
  return [x * tileWidth, (y - 1) * tileWidth, (x + 1) * tileWidth, y * tileWidth]
}
