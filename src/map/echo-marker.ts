import Icon from 'ol/style/Icon.js'
import Style from 'ol/style/Style.js'
import { echoComposition } from './echo-composition.ts'
import type { CompositionMember } from './echo-composition.ts'
import type { EchoDefinition } from '../domain/types.ts'
import { drawPortraitMarker, PORTRAIT_MARKER_CANVAS_SIZE, PORTRAIT_MARKER_SIZES } from './boss-marker.ts'

export const ECHO_MARKER_SIZES = {
  singleC1: PORTRAIT_MARKER_SIZES[1],
  singleC3: PORTRAIT_MARKER_SIZES[3],
  multipleC1: 36,
  multipleWithC3: 40,
} as const

export function echoMarkerSize(types: readonly { cost: EchoDefinition['cost']; count: number | null }[]): number {
  const count = (cost: EchoDefinition['cost']) => types.reduce((sum, type) => (
    type.cost === cost ? sum + (type.count ?? 1) : sum
  ), 0)
  const c1Count = count(1)
  const c3Count = count(3)
  if (c3Count === 0) return c1Count <= 1 ? ECHO_MARKER_SIZES.singleC1 : ECHO_MARKER_SIZES.multipleC1
  return c1Count === 0 && c3Count === 1 ? ECHO_MARKER_SIZES.singleC3 : ECHO_MARKER_SIZES.multipleWithC3
}

export function createEchoMarkerStyles(onChange: () => void, pixelRatio = window.devicePixelRatio || 1) {
  const ratio = Math.max(2, Math.ceil(pixelRatio))
  const images = new Map<string, HTMLImageElement>()
  const cache = new Map<string, {
    canvas: HTMLCanvasElement
    styles: Style[]
    redraw: () => void
  }>()
  let disposed = false
  let definitionSource: readonly EchoDefinition[] | null = null
  let definitions: ReadonlyMap<string, EchoDefinition> = new Map()

  function getImage(url: string): HTMLImageElement | undefined {
    if (!url) return undefined
    const old = images.get(url)
    if (old) return old
    const image = new Image()
    images.set(url, image)
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (disposed) return
      for (const entry of cache.values()) entry.redraw()
      onChange()
    }
    image.onerror = () => {
      image.onload = null
      image.onerror = null
    }
    image.src = url
    return image
  }

  function get(members: readonly CompositionMember[], echoes: readonly EchoDefinition[], {
    showText = false,
    shape = 'diamond',
  }: { showText?: boolean; shape?: 'circle' | 'diamond' } = {}) {
    if (definitionSource !== echoes) {
      definitionSource = echoes
      definitions = new Map(echoes.map((echo) => [echo.id, echo]))
    }
    const composition = echoComposition(members, echoes, definitions)
    const size = echoMarkerSize(composition.types)
    const key = JSON.stringify([showText, shape, size, composition.types.map(({ id, iconUrl, cost }) => [id, iconUrl, cost])])
    const old = cache.get(key)
    if (old) return old
    const count = composition.types.length
    const single = count === 1 ? composition.types[0] : undefined
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = PORTRAIT_MARKER_CANVAS_SIZE * ratio
    // Keep first-use hit detection from forcing a GPU canvas readback.
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const portraits = (showText ? composition.portraits : composition.types.slice(0, 4))
      .map((echo) => ({ echo, image: getImage(echo.iconUrl) }))
    function redraw(): void {
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.imageSmoothingQuality = 'high'
      if (single) {
        drawPortraitMarker(context, shape, portraits[0]?.image)
        return
      }
      drawPortraitMarker(context, shape, undefined, (context, contentSize, center) => {
        const half = contentSize / 2
        const left = center - half
        const top = center - half
        const cells = count === 2
          ? [[left, top, half, contentSize], [center, top, half, contentSize]]
          : count === 3
            ? [[left, top, half, contentSize], [center, top, half, half], [center, center, half, half]]
            : [[left, top, half, half], [center, top, half, half], [left, center, half, half], [center, center, half, half]]
        portraits.forEach(({ echo, image }, index) => {
          const cell = cells[index]
          if (!cell) return
          const [x = 0, y = 0, width = 0, height = 0] = cell
          // A diamond clipped by these cells forms triangles. Anchor the portrait
          // at the triangle centroid, rather than the center of its bounding box.
          const anchorX = shape === 'diamond' ? center + (x < center ? -half / 3 : half / 3) : x + width / 2
          const anchorY = shape === 'diamond'
            ? height === contentSize ? center : center + (y < center ? -half / 3 : half / 3)
            : y + height / 2
          if (image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
            const scale = Math.max(
              2 * Math.max(anchorX - x, x + width - anchorX) / image.naturalWidth,
              2 * Math.max(anchorY - y, y + height - anchorY) / image.naturalHeight,
            )
            const sourceWidth = width / scale
            const sourceHeight = height / scale
            context.drawImage(image,
              image.naturalWidth / 2 + (x - anchorX) / scale, image.naturalHeight / 2 + (y - anchorY) / scale,
              sourceWidth, sourceHeight, x, y, width, height)
          } else if (showText) {
            context.fillStyle = echo.cost === 3 ? '#e9c57c' : '#9adac3'
            context.font = '600 6px sans-serif'
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.fillText(echo.name.slice(0, 2), anchorX, anchorY)
          }
        })
        if (count >= 2) {
          // Convert one display pixel to canvas coordinates; the outer frame clips the dividers.
          const lineWidth = PORTRAIT_MARKER_SIZES[4] / size
          context.fillStyle = '#fff'
          context.fillRect(center - lineWidth / 2, top, lineWidth, contentSize)
          if (count >= 3) {
            context.fillRect(count === 3 ? center : left, center - lineWidth / 2,
              count === 3 ? half : contentSize, lineWidth)
          }
        }
        if (showText && composition.overflow > 0) {
          context.fillStyle = '#cbe6db'
          context.font = '600 7px sans-serif'
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          const offset = half / (shape === 'diamond' ? 3 : 2)
          context.fillText(`+${composition.overflow}`, center + offset, center + offset)
        }
        if (showText && count === 0) {
          context.fillStyle = '#91a99e'
          context.font = '16px sans-serif'
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.fillText('+', center, center)
        }
      })
    }
    redraw()
    const styles = [new Style({ image: new Icon({ img: canvas, scale: size / PORTRAIT_MARKER_SIZES[4] / ratio }) })]
    const entry = { canvas, styles, redraw }
    cache.set(key, entry)
    if (cache.size > 256) {
      const first = cache.keys().next().value
      if (first !== undefined) cache.delete(first)
    }
    return entry
  }

  function dispose(): void {
    disposed = true
    for (const image of images.values()) {
      image.onload = null
      image.onerror = null
      image.removeAttribute('src')
    }
    images.clear()
    cache.clear()
  }
  return { get, dispose, ready: () => Promise.all([...images.values()].map((image) => image.decode())) }
}
