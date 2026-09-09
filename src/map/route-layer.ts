import Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import MultiLineString from 'ol/geom/MultiLineString.js'
import { buffer, createEmpty, extendCoordinate } from 'ol/extent.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import Icon from 'ol/style/Icon.js'
import { apply } from 'ol/transform.js'
import type RenderEvent from 'ol/render/Event.js'
import { mapFeaturePointIds } from './point-layers.ts'
import { bossMarkerShape, portraitMarkerOutline, PORTRAIT_MARKER_CANVAS_SIZE } from './boss-marker.ts'
import { createIconOutlineCache } from './icon-outline.ts'
import type { MapDisplayPoint, RoutePoint, RouteResult } from '../domain/types.ts'

const ICON_GAP = 4
const LINE_WIDTH = 3
const ROUTE_OPACITY = 0.6
const ARROW_LENGTH = 9
const ARROW_HALF_WIDTH = 5
const ARROW_SPACING = 80
const MIN_ARROW_LEG_LENGTH = 24
const MIN_ROUTE_SCALE = 0.4
const TELEPORT_ARRIVAL_RADIUS = 5
type Pixel = [number, number]
type RouteVisit = RouteResult['points'][number]

export interface RouteLegDetails {
  debugId: string
  type: 'walk' | 'teleport'
  pointIndex: number
  pointCount: number
  routeAlgorithm: RouteResult['algorithm']
  routeTotalCost: number
  from: RoutePoint
  to: RouteVisit
  previous: RouteVisit | null
  distance: number
  previousDistance: number | null
}

interface VisibleIcon {
  center: Pixel
  outline: Pixel[]
  diamond: boolean
}

function coordinateDistance(left: RoutePoint, right: RoutePoint): number {
  return Math.hypot(
    left.coordinate.x - right.coordinate.x,
    left.coordinate.y - right.coordinate.y,
    left.coordinate.z - right.coordinate.z,
  )
}

function squaredSegmentDistance(coordinate: number[], from: RoutePoint, to: RoutePoint): number {
  const [x = 0, y = 0] = coordinate
  const [fromX, fromY] = from.mapCoordinate
  const [toX, toY] = to.mapCoordinate
  const dx = toX - fromX
  const dy = toY - fromY
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return (x - fromX) ** 2 + (y - fromY) ** 2
  const progress = Math.max(0, Math.min(1, ((x - fromX) * dx + (y - fromY) * dy) / lengthSquared))
  const nearestX = fromX + progress * dx
  const nearestY = fromY + progress * dy
  return (x - nearestX) ** 2 + (y - nearestY) ** 2
}

function debugPoint(point: RoutePoint | null) {
  return point ? {
    id: point.id,
    name: point.name,
    echoId: point.echoId,
    stateId: point.stateId,
    levelId: point.levelId,
    xyz: point.coordinate,
    mapCoordinate: point.mapCoordinate,
    isTeleportArrival: point.isTeleportArrival ?? false,
    members: point.members ?? [],
  } : null
}

export function routeLegDebugData(details: RouteLegDetails) {
  return {
    version: 1,
    debugId: details.debugId,
    route: {
      algorithm: details.routeAlgorithm,
      totalCost: details.routeTotalCost,
      pointCount: details.pointCount,
    },
    leg: {
      type: details.type,
      fromRouteIndex: details.type === 'walk' ? details.pointIndex - 1 : null,
      toRouteIndex: details.pointIndex,
      xyzDistance: details.distance,
      previousTargetXyzDistance: details.previousDistance,
    },
    from: debugPoint(details.from),
    to: debugPoint(details.to),
    previousTarget: debugPoint(details.previous),
  }
}

function corners(icon: VisibleIcon | undefined, fallback: Pixel): Pixel[] {
  if (!icon) return [fallback]
  return icon.diamond ? icon.outline : [icon.center]
}

function boundaryPoint(icon: VisibleIcon | undefined, from: Pixel, towards: Pixel): Pixel {
  if (!icon || icon.diamond) return from
  const dx = towards[0] - from[0]
  const dy = towards[1] - from[1]
  let nearest = Number.POSITIVE_INFINITY
  for (const [index, left] of icon.outline.entries()) {
    const right = icon.outline[(index + 1) % icon.outline.length]
    if (!right) continue
    const ex = right[0] - left[0]
    const ey = right[1] - left[1]
    const denominator = dx * ey - dy * ex
    if (Math.abs(denominator) < 1e-9) continue
    const x = left[0] - from[0]
    const y = left[1] - from[1]
    const alongRay = (x * ey - y * ex) / denominator
    const alongEdge = (x * dy - y * dx) / denominator
    if (alongRay >= 0 && alongEdge >= -1e-9 && alongEdge <= 1 + 1e-9) nearest = Math.min(nearest, alongRay)
  }
  return Number.isFinite(nearest) ? [from[0] + dx * nearest, from[1] + dy * nearest] : from
}

function linkEndpoints(from: Pixel, to: Pixel, fromIcon?: VisibleIcon, toIcon?: VisibleIcon, lineWidth = LINE_WIDTH): [Pixel, Pixel] | null {
  if (fromIcon && fromIcon === toIcon) return null
  let start = from
  let end = to
  let shortest = Number.POSITIVE_INFINITY
  for (const left of corners(fromIcon, from)) {
    for (const right of corners(toIcon, to)) {
      const distance = Math.hypot(right[0] - left[0], right[1] - left[1])
      if (distance < shortest) {
        shortest = distance
        start = left
        end = right
      }
    }
  }
  const fromBoundary = boundaryPoint(fromIcon, start, end)
  const toBoundary = boundaryPoint(toIcon, end, start)
  // Overlapping outlines must not create a backwards segment between their edges.
  if ((toBoundary[0] - fromBoundary[0]) * (end[0] - start[0])
    + (toBoundary[1] - fromBoundary[1]) * (end[1] - start[1]) <= 0) return null
  start = fromBoundary
  end = toBoundary
  shortest = Math.hypot(end[0] - start[0], end[1] - start[1])
  const startGap = fromIcon ? ICON_GAP + lineWidth / 2 : 0
  const endGap = toIcon ? ICON_GAP + lineWidth / 2 : 0
  if (shortest <= startGap + endGap) return null
  const dx = (end[0] - start[0]) / shortest
  const dy = (end[1] - start[1]) / shortest
  return [[start[0] + dx * startGap, start[1] + dy * startGap], [end[0] - dx * endGap, end[1] - dy * endGap]]
}

function directionArrows([from, to]: [Pixel, Pixel], viewportSize: number[], scale: number): [Pixel, Pixel, Pixel][] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (length < MIN_ARROW_LEG_LENGTH * scale) return []
  const arrowLength = ARROW_LENGTH * scale
  const arrowHalfWidth = ARROW_HALF_WIDTH * scale
  const dx = (to[0] - from[0]) / length
  const dy = (to[1] - from[1]) / length
  const count = Math.max(1, Math.floor(length / ARROW_SPACING))
  const spacing = length / (count + 1)
  // Restrict the repeated arrows to the viewport without shifting their positions on pan.
  let visibleStart = 0
  let visibleEnd = length
  for (const [origin, direction, size] of [[from[0], dx, viewportSize[0]], [from[1], dy, viewportSize[1]]]) {
    if (origin === undefined || direction === undefined || size === undefined) continue
    if (Math.abs(direction) < 1e-9) {
      if (origin < -arrowLength || origin > size + arrowLength) return []
    } else {
      const first = (-arrowLength - origin) / direction
      const last = (size + arrowLength - origin) / direction
      visibleStart = Math.max(visibleStart, Math.min(first, last))
      visibleEnd = Math.min(visibleEnd, Math.max(first, last))
    }
  }
  const arrows: [Pixel, Pixel, Pixel][] = []
  for (let index = Math.max(1, Math.ceil(visibleStart / spacing)); index <= Math.min(count, Math.floor(visibleEnd / spacing)); index += 1) {
    const x = from[0] + dx * spacing * index
    const y = from[1] + dy * spacing * index
    const tailX = x - dx * arrowLength / 2
    const tailY = y - dy * arrowLength / 2
    arrows.push([
      [tailX - dy * arrowHalfWidth, tailY + dx * arrowHalfWidth],
      [x + dx * arrowLength / 2, y + dy * arrowLength / 2],
      [tailX + dy * arrowHalfWidth, tailY - dx * arrowHalfWidth],
    ])
  }
  return arrows
}

export function createRouteLayer(pointLayers: readonly VectorLayer[] = []) {
  const routeSource = new VectorSource()
  const outlineCache = createIconOutlineCache()
  // Keep masking on its own canvas so it cannot erase the map or point layers.
  const layer = new VectorLayer({ source: routeSource, style: null, zIndex: 60, className: 'route-lines', updateWhileAnimating: true, updateWhileInteracting: true })
  let routeExtent = createEmpty()
  let legs: RouteLegDetails[] = []
  let teleportArrivals: RoutePoint[] = []

  function renderRoute({ context, frameState, inversePixelTransform }: RenderEvent): void {
    if (!context || !('clearRect' in context) || !frameState?.extent || !inversePixelTransform || routeSource.isEmpty()) return
    const resolution = frameState.viewState.resolution
    // Use map units per CSS pixel so scaling is continuous and shared by all
    // maps and exports, independent of their URL zoom and device pixel ratio.
    const scale = Math.max(MIN_ROUTE_SCALE, Math.min(1, 1 / Math.sqrt(resolution)))
    const lineWidth = LINE_WIDTH * scale
    const extent = buffer(frameState.extent, 64 * resolution)
    const icons: VisibleIcon[] = []
    const iconsByPoint = new Map<string, VisibleIcon>()
    const coordinateTransform = frameState.coordinateToPixelTransform
    function pixel(coordinate: number[]): Pixel {
      const [x = 0, y = 0] = apply(coordinateTransform, coordinate)
      return [x, y]
    }
    for (const pointLayer of pointLayers) {
      if (!pointLayer.getVisible() || pointLayer.getOpacity() === 0) continue
      for (const feature of pointLayer.getSource()?.getFeaturesInExtent(extent) ?? []) {
        const styleFunction = feature.getStyleFunction() ?? pointLayer.getStyleFunction()
        const result = styleFunction?.(feature, resolution)
        for (const style of Array.isArray(result) ? result : result ? [result] : []) {
          const geometry = style.getGeometryFunction()(feature)
          const icon = style.getImage()
          if (!(geometry instanceof Point) || !icon || icon.getOpacity() === 0) continue
          const size = icon.getSize()
          const anchor = icon.getAnchor()
          if (!size || !anchor) continue
          const [width = 0, height = 0] = size
          const [anchorX = 0, anchorY = 0] = anchor
          const [scaleX = 1, scaleY = 1] = icon.getScaleArray()
          const [x, y] = pixel(geometry.getCoordinates())
          const point = feature.get('mapPoint') as MapDisplayPoint | undefined
          const locations = feature.get('locations')
          const shape = point?.category === 'echo' ? 'diamond'
            : Array.isArray(locations) ? locations.length > 1 ? 'circle' : 'diamond'
            : point?.category === 'navigation' && point.location.iconUrl ? bossMarkerShape(point.location) : null
          const sourceOutline: Pixel[] = shape
            ? portraitMarkerOutline(shape).map(([x, y]) => [x / PORTRAIT_MARKER_CANVAS_SIZE * width, y / PORTRAIT_MARKER_CANVAS_SIZE * height])
            : (icon instanceof Icon ? outlineCache.get(icon) : null) ?? [[0, 0], [width, 0], [width, height], [0, height]]
          const outline: Pixel[] = sourceOutline.map(([offsetX, offsetY]) => [x + (offsetX - anchorX) * scaleX, y + (offsetY - anchorY) * scaleY])
          const visibleIcon: VisibleIcon = {
            // A convex combination stays inside even when the artwork is off-center.
            center: shape === 'circle'
              ? [x + (width / 2 - anchorX) * scaleX, y + (height / 2 - anchorY) * scaleY]
              : [outline.reduce((sum, [x]) => sum + x, 0) / outline.length, outline.reduce((sum, [, y]) => sum + y, 0) / outline.length],
            outline,
            diamond: shape === 'diamond',
          }
          icons.push(visibleIcon)
          for (const id of mapFeaturePointIds(feature) ?? []) iconsByPoint.set(id, visibleIcon)
        }
      }
    }
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = inversePixelTransform
    context.save()
    context.setTransform(a, b, c, d, e, f)
    context.globalAlpha = 1
    context.globalCompositeOperation = 'source-over'
    context.strokeStyle = '#65f1c2'
    context.lineWidth = lineWidth
    context.lineCap = 'round'
    context.setLineDash([9 * scale, 7 * scale])
    const arrows: [Pixel, Pixel, Pixel][] = []
    for (const { from, to } of legs) {
      const endpoints = linkEndpoints(pixel([...from.mapCoordinate]), pixel([...to.mapCoordinate]), from.isTeleportArrival ? undefined : iconsByPoint.get(from.id), iconsByPoint.get(to.id), lineWidth)
      if (!endpoints) continue
      context.beginPath()
      context.moveTo(...endpoints[0])
      context.lineTo(...endpoints[1])
      context.stroke()
      arrows.push(...directionArrows(endpoints, frameState.size, scale))
    }
    context.setLineDash([])
    context.lineJoin = 'round'
    if (arrows.length > 0) {
      context.beginPath()
      for (const [left, tip, right] of arrows) {
        context.moveTo(...left)
        context.lineTo(...tip)
        context.lineTo(...right)
      }
      context.stroke()
    }
    context.fillStyle = '#07110f'
    context.strokeStyle = '#65f1c2'
    context.lineWidth = Math.max(1.5, 2 * scale)
    for (const arrival of teleportArrivals) {
      const [x, y] = pixel([...arrival.mapCoordinate])
      context.beginPath()
      context.arc(x, y, TELEPORT_ARRIVAL_RADIUS * scale, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
    // Clip against visible outlines, including unrelated icons crossed by a leg.
    context.globalAlpha = 1
    context.globalCompositeOperation = 'destination-out'
    context.fillStyle = '#000'
    context.lineWidth = ICON_GAP * 2
    for (const icon of icons) {
      context.beginPath()
      icon.outline.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.closePath()
      context.fill()
      context.stroke()
    }
    // Fade the isolated route canvas once, after drawing and icon masking, so
    // arrows, dashes and crossing legs keep the same opacity where they overlap.
    context.resetTransform()
    context.globalCompositeOperation = 'destination-in'
    context.globalAlpha = ROUTE_OPACITY
    context.fillRect(0, 0, context.canvas.width, context.canvas.height)
    context.restore()
  }

  layer.on('postrender', renderRoute)

  function update(route: RouteResult | null): void {
    routeSource.clear(true)
    routeExtent = createEmpty()
    legs = []
    teleportArrivals = []
    if (!route || route.points.length === 0) {
      return
    }
    const segments: [number, number][][] = []
    let coordinates: [number, number][] = []
    const arrivalIds = new Set<string>()
    for (const [index, point] of route.points.entries()) {
      const previous = route.points[index - 1] ?? null
      const from = point.teleportFrom ?? previous
      if (from) legs.push({
        debugId: `route-leg:${point.teleportFrom ? 'teleport' : 'walk'}:${from.id}->${point.id}`,
        type: point.teleportFrom ? 'teleport' : 'walk',
        pointIndex: index,
        pointCount: route.points.length,
        routeAlgorithm: route.algorithm,
        routeTotalCost: route.totalCost,
        from,
        to: point,
        previous,
        distance: coordinateDistance(from, point),
        previousDistance: point.teleportFrom && previous ? coordinateDistance(previous, point) : null,
      })
      for (const candidate of [point, point.teleportFrom]) {
        if (candidate?.isTeleportArrival && !arrivalIds.has(candidate.id)) {
          arrivalIds.add(candidate.id)
          teleportArrivals.push(candidate)
        }
      }
      extendCoordinate(routeExtent, point.mapCoordinate)
      if (point.teleportFrom) {
        extendCoordinate(routeExtent, point.teleportFrom.mapCoordinate)
        if (coordinates.length > 1) segments.push(coordinates)
        coordinates = [point.teleportFrom.mapCoordinate]
      }
      coordinates.push(point.mapCoordinate)
    }
    if (coordinates.length > 1) segments.push(coordinates)
    if (segments.length > 0) {
      const line = new Feature({ geometry: new MultiLineString(segments) })
      routeSource.addFeature(line)
    }
  }

  function hitTest(coordinate: number[], resolution: number, hitTolerance = 8): RouteLegDetails | null {
    if (!Number.isFinite(resolution) || resolution <= 0) return null
    const maximumSquaredDistance = (resolution * hitTolerance) ** 2
    let nearestSquaredDistance = maximumSquaredDistance
    let nearest: RouteLegDetails | null = null
    for (const leg of legs) {
      const distance = squaredSegmentDistance(coordinate, leg.from, leg.to)
      if (distance <= nearestSquaredDistance) {
        nearestSquaredDistance = distance
        nearest = leg
      }
    }
    return nearest
  }

  function dispose(): void {
    layer.un('postrender', renderRoute)
    outlineCache.dispose()
    routeSource.clear(true)
    routeSource.dispose()
    layer.dispose()
  }

  return { layer, update, hitTest, getExtent: () => routeExtent, dispose }
}
