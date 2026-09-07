import Icon from 'ol/style/Icon.js'
import Style from 'ol/style/Style.js'
import { echoComposition } from './echo-composition.ts'
import type { CompositionMember } from './echo-composition.ts'
import type { EchoDefinition } from '../domain/types.ts'
import { drawPortraitMarker, PORTRAIT_MARKER_CANVAS_SIZE, PORTRAIT_MARKER_SIZES } from './boss-marker.ts'

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

  function get(members: readonly CompositionMember[], echoes: readonly EchoDefinition[], { showText = false }: { showText?: boolean } = {}) {
    if (definitionSource !== echoes) {
      definitionSource = echoes
      definitions = new Map(echoes.map((echo) => [echo.id, echo]))
    }
    const composition = echoComposition(members, echoes, definitions)
    const key = JSON.stringify([showText, composition.types.map(({ id, iconUrl, cost }) => [id, iconUrl, cost])])
    const old = cache.get(key)
    if (old) return old
    const count = composition.types.length
    const single = count === 1 ? composition.types[0] : undefined
    const size = single ? PORTRAIT_MARKER_SIZES[single.cost] : count === 0 ? 31 : 54
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
        drawPortraitMarker(context, 'diamond', portraits[0]?.image)
        return
      }
      drawPortraitMarker(context, 'diamond', undefined, (context, contentSize, center) => {
        const cellSize = contentSize * (count === 2 ? 0.5 : 0.42)
        const offset = contentSize / 4
        const positions = count === 2 ? [[-offset, 0], [offset, 0]]
          : count === 3 ? [[0, -offset], [-offset / 1.4, offset / 1.4], [offset / 1.4, offset / 1.4]]
            : [[0, -offset], [offset, 0], [0, offset], [-offset, 0]]
        portraits.forEach(({ echo, image }, index) => {
          const [x = 0, y = 0] = positions[index] ?? []
          if (image?.complete && image.naturalWidth > 0) {
            const scale = cellSize / Math.max(image.naturalWidth, image.naturalHeight)
            const width = image.naturalWidth * scale
            const height = image.naturalHeight * scale
            context.drawImage(image, center + x - width / 2, center + y - height / 2, width, height)
          } else if (showText) {
            context.fillStyle = echo.cost === 3 ? '#e9c57c' : '#9adac3'
            context.font = '600 6px sans-serif'
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.fillText(echo.name.slice(0, 2), center + x, center + y)
          }
        })
        if (showText && composition.overflow > 0) {
          context.fillStyle = '#cbe6db'
          context.font = '600 7px sans-serif'
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.fillText(`+${composition.overflow}`, center - offset, center)
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
