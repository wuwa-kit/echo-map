import Layer from 'ol/layer/Layer.js'
import { apply } from 'ol/transform.js'
import { gameToMapCoordinate } from './projection.ts'

export const EDITOR_GRID_SPACING = 200

export function gridCoordinates(min: number, max: number, origin = 0): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return []
  const first = Math.ceil((min - origin) / EDITOR_GRID_SPACING)
  const last = Math.floor((max - origin) / EDITOR_GRID_SPACING)
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => origin + (first + index) * EDITOR_GRID_SPACING)
}

export function createEditorGridLayer() {
  // Keep this canvas isolated from OpenLayers' shared canvas render targets.
  const container = document.createElement('div')
  container.className = 'absolute inset-0 pointer-events-none'
  const canvas = document.createElement('canvas')
  canvas.className = 'absolute left-0 top-0'
  container.appendChild(canvas)
  const context = canvas.getContext('2d')
  const [originX, originY] = gameToMapCoordinate(0, 0)
  return new Layer({
    visible: false,
    zIndex: 6,
    render(frame) {
      const [width = 0, height = 0] = frame.size
      const ratio = frame.pixelRatio
      const pixelWidth = Math.round(width * ratio)
      const pixelHeight = Math.round(height * ratio)
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      if (!context) return container
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      if (!frame.extent) return container
      const [minX = 0, minY = 0, maxX = 0, maxY = 0] = frame.extent
      context.strokeStyle = 'rgba(255, 255, 255, 0.42)'
      context.lineWidth = 1
      context.setLineDash([5, 5])
      context.beginPath()
      function line(x1: number, y1: number, x2: number, y2: number): void {
        const [ax = 0, ay = 0] = apply(frame.coordinateToPixelTransform, [x1, y1])
        const [bx = 0, by = 0] = apply(frame.coordinateToPixelTransform, [x2, y2])
        context?.moveTo(ax, ay)
        context?.lineTo(bx, by)
      }
      for (const x of gridCoordinates(minX, maxX, originX)) line(x, minY, x, maxY)
      for (const y of gridCoordinates(minY, maxY, originY)) line(minX, y, maxX, y)
      context.stroke()
      return container
    },
  })
}
