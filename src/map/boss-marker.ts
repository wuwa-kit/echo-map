import Icon from 'ol/style/Icon.js'
import Style from 'ol/style/Style.js'
import type { NavigationPoint } from '../domain/types.ts'

type BossMarkerShape = 'diamond' | 'cut-diamond'

const MARKER_SIZE = 44
const CANVAS_SIZE = MARKER_SIZE + 2
const CENTER = CANVAS_SIZE / 2
const OUTER_BORDER = 1.5
const WHITE_BORDER = 2.5
const PORTRAIT_INSET = OUTER_BORDER + WHITE_BORDER + 1
const CUT_HALF_WIDTH = 5

export function bossMarkerShape(point: Pick<NavigationPoint, 'kind' | 'typeName'>): BossMarkerShape | null {
  if (point.kind !== 'boss') {
    return null
  }
  return /^.{4}之.$/u.test(point.typeName) ? 'cut-diamond' : 'diamond'
}

function markerPath(shape: BossMarkerShape, inset: number): Path2D {
  const radius = MARKER_SIZE / 2 - inset * Math.SQRT2
  const path = new Path2D()
  if (shape === 'diamond') {
    path.moveTo(CENTER, CENTER - radius)
    path.lineTo(CENTER + radius, CENTER)
    path.lineTo(CENTER, CENTER + radius)
    path.lineTo(CENTER - radius, CENTER)
  } else {
    const edge = MARKER_SIZE / 2 - inset
    const corner = radius + CUT_HALF_WIDTH - edge
    path.moveTo(CENTER - corner, CENTER - edge)
    path.lineTo(CENTER + corner, CENTER - edge)
    path.lineTo(CENTER + edge, CENTER - corner)
    path.lineTo(CENTER + edge, CENTER + corner)
    path.lineTo(CENTER + corner, CENTER + edge)
    path.lineTo(CENTER - corner, CENTER + edge)
    path.lineTo(CENTER - edge, CENTER + corner)
    path.lineTo(CENTER - edge, CENTER - corner)
  }
  path.closePath()
  return path
}

function drawMarker(context: CanvasRenderingContext2D, shape: BossMarkerShape, portrait?: HTMLImageElement): void {
  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  context.fillStyle = '#000'
  context.fill(markerPath(shape, 0))
  context.fillStyle = '#fff'
  context.fill(markerPath(shape, OUTER_BORDER))
  context.fillStyle = '#000'
  context.fill(markerPath(shape, OUTER_BORDER + WHITE_BORDER))
  if (!portrait || portrait.naturalWidth === 0 || portrait.naturalHeight === 0) {
    return
  }

  const contentSize = MARKER_SIZE - 2 * PORTRAIT_INSET * (shape === 'diamond' ? Math.SQRT2 : 1)
  const scale = contentSize / Math.max(portrait.naturalWidth, portrait.naturalHeight)
  const width = portrait.naturalWidth * scale
  const height = portrait.naturalHeight * scale
  context.save()
  context.clip(markerPath(shape, PORTRAIT_INSET))
  context.drawImage(portrait, CENTER - width / 2, CENTER - height / 2, width, height)
  context.restore()
}

export function createBossMarkerStyles(onChange: () => void) {
  const pixelRatio = Math.max(2, Math.ceil(window.devicePixelRatio || 1))
  const styles = new Map<string, Style[]>()
  const pendingImages = new Set<HTMLImageElement>()

  function getStyle(point: Pick<NavigationPoint, 'kind' | 'typeName' | 'iconUrl' | 'mode'>): Style[] | null {
    const shape = bossMarkerShape(point)
    if (!shape) {
      return null
    }
    const opacity = point.mode === 'fast-travel' ? 1 : 0.48
    const key = JSON.stringify([shape, point.iconUrl, opacity])
    const cached = styles.get(key)
    if (cached) {
      return cached
    }

    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = CANVAS_SIZE * pixelRatio
    const context = canvas.getContext('2d')
    if (!context) {
      return null
    }
    context.scale(pixelRatio, pixelRatio)
    context.imageSmoothingQuality = 'high'
    drawMarker(context, shape)
    const result = [new Style({ image: new Icon({ img: canvas, scale: 1 / pixelRatio, opacity }) })]
    styles.set(key, result)

    if (point.iconUrl) {
      const portrait = new Image()
      pendingImages.add(portrait)
      const finish = () => {
        portrait.onload = null
        portrait.onerror = null
        pendingImages.delete(portrait)
      }
      portrait.crossOrigin = 'anonymous'
      portrait.onload = () => {
        finish()
        drawMarker(context, shape, portrait)
        onChange()
      }
      portrait.onerror = finish
      portrait.src = point.iconUrl
    }
    return result
  }

  function dispose(): void {
    for (const image of pendingImages) {
      image.onload = null
      image.onerror = null
      image.removeAttribute('src')
    }
    pendingImages.clear()
    styles.clear()
  }

  return { getStyle, dispose }
}
