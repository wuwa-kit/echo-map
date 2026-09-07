import ImageState from 'ol/ImageState.js'
import type Icon from 'ol/style/Icon.js'

export type OutlinePoint = [number, number]

const MIN_ALPHA = 32

function cross(origin: OutlinePoint, left: OutlinePoint, right: OutlinePoint): number {
  return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0])
}

export function alphaOutline({ width, height, data }: Pick<ImageData, 'width' | 'height' | 'data'>): OutlinePoint[] {
  const points: OutlinePoint[] = []
  for (let y = 0; y < height; y += 1) {
    let left = width
    let right = -1
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) < MIN_ALPHA) continue
      left = Math.min(left, x)
      right = x
    }
    if (right >= left) points.push([left, y], [right + 1, y], [right + 1, y + 1], [left, y + 1])
  }
  points.sort((left, right) => left[0] - right[0] || left[1] - right[1])
  function halfHull(ordered: OutlinePoint[]): OutlinePoint[] {
    const hull: OutlinePoint[] = []
    for (const point of ordered) {
      while (hull.length >= 2) {
        const left = hull[hull.length - 2]
        const right = hull[hull.length - 1]
        if (!left || !right || cross(left, right, point) > 0) break
        hull.pop()
      }
      hull.push(point)
    }
    hull.pop()
    return hull
  }
  // The convex outline bridges holes and recesses instead of letting routes enter them.
  return [...halfHull(points), ...halfHull([...points].reverse())]
}

export function createIconOutlineCache() {
  let cache = new WeakMap<CanvasImageSource, Map<string, OutlinePoint[] | null>>()
  let canvas: HTMLCanvasElement | null = null

  function get(icon: Icon): OutlinePoint[] | null {
    // An image still loading must not permanently cache the rectangular fallback.
    if (icon.getImageState() !== ImageState.LOADED) return null
    const size = icon.getSize()
    const origin = icon.getOrigin()
    if (!size || !origin) return null
    const [width = 0, height = 0] = size
    const [x = 0, y = 0] = origin
    if (width <= 0 || height <= 0) return null
    const image = icon.getImage(1)
    let entries = cache.get(image)
    if (!entries) {
      entries = new Map()
      cache.set(image, entries)
    }
    const key = `${x},${y},${width},${height}`
    if (entries.has(key)) return entries.get(key) ?? null
    let outline: OutlinePoint[] | null = null
    try {
      canvas ??= document.createElement('canvas')
      // Resizing also resets a canvas tainted by an unreadable cross-origin image.
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (context) {
        const ratio = icon.getPixelRatio(1)
        context.drawImage(image, x * ratio, y * ratio, width * ratio, height * ratio, 0, 0, width, height)
        const candidate = alphaOutline(context.getImageData(0, 0, width, height))
        if (candidate.length >= 3) outline = candidate
      }
    } catch {
      // Missing pixels or CORS restrictions keep the conservative rectangular fallback.
    }
    entries.set(key, outline)
    return outline
  }

  function dispose(): void {
    cache = new WeakMap()
    if (canvas) canvas.width = canvas.height = 0
    canvas = null
  }

  return { get, dispose }
}
