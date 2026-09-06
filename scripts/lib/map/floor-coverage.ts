import { PNG } from 'pngjs'
import type { FloorCoverageTile, MapStateDefinition } from '../../../src/domain/types.ts'
import { officialFloorTileUrl } from '../../../src/data/official-asset-urls.ts'
import { fetchBytes } from '../http.ts'

const COVERAGE_SIZE = 1024
const MIN_ALPHA = 16

export function mergeFloorAlpha(mask: Uint8Array, image: { width: number; height: number; data: Uint8Array }, size: number): void {
  if (mask.length !== size * size || image.width <= 0 || image.height <= 0 || image.data.length !== image.width * image.height * 4) {
    throw new Error('无效楼层图片尺寸')
  }
  // Union sibling images before encoding. Keep narrow passages when reducing larger images.
  for (let y = 0; y < image.height; y++) {
    const row = Math.floor(y * size / image.height) * size
    for (let x = 0; x < image.width; x++) {
      if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) >= MIN_ALPHA) {
        const left = Math.floor(x * size / image.width)
        const right = Math.ceil((x + 1) * size / image.width)
        const bottom = Math.ceil((y + 1) * size / image.height)
        for (let targetY = Math.floor(row / size); targetY < bottom; targetY++) mask.fill(1, targetY * size + left, targetY * size + right)
      }
    }
  }
}

export function encodeFloorCoverage(tile: string, mask: Uint8Array, size: number): FloorCoverageTile {
  if (mask.length !== size * size) throw new Error('无效楼层覆盖尺寸')
  const runs: [number, number][] = []
  let start = -1
  for (let index = 0; index <= mask.length; index++) {
    if (mask[index]) {
      if (start === -1) start = index
    } else if (start !== -1) {
      runs.push([start, index])
      start = -1
    }
  }
  return { tile, size, runs }
}

async function readFloorImage(url: string): Promise<PNG> {
  try {
    return PNG.sync.read(Buffer.from(await fetchBytes(url)))
  } catch (error) {
    throw new Error(`无法生成楼层覆盖范围：${url}`, { cause: error })
  }
}

export async function buildFloorCoverage(states: MapStateDefinition[], resourceHash: string): Promise<MapStateDefinition[]> {
  const result: MapStateDefinition[] = states.map((state) => ({ ...state, layeredMaps: state.layeredMaps.map((group) => ({ ...group, coverage: [] })) }))
  const jobs = result.flatMap((state) => state.layeredMaps.map((group) => ({ state, group })))
  let completed = 0
  const queue = jobs.values()
  // Four images at most decode concurrently; generation never runs in the browser.
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (const { state, group } of queue) {
      const masks = new Map<string, Uint8Array>()
      for (const path of new Set(group.floors.flatMap(({ tiles }) => tiles))) {
        const tile = path.split('/').at(-1)
        if (!tile || !/^-?\d+_-?\d+\.png$/u.test(tile)) throw new Error(`无效楼层瓦片：${path}`)
        const mask = masks.get(tile) ?? new Uint8Array(COVERAGE_SIZE * COVERAGE_SIZE)
        masks.set(tile, mask)
        mergeFloorAlpha(mask, await readFloorImage(officialFloorTileUrl(resourceHash, state.id, path)), COVERAGE_SIZE)
      }
      group.coverage = [...masks].map(([tile, mask]) => encodeFloorCoverage(tile, mask, COVERAGE_SIZE))
      completed++
      if (completed % 10 === 0 || completed === jobs.length) console.log(`楼层覆盖范围：${completed}/${jobs.length} 组`)
    }
  }))
  return result
}
