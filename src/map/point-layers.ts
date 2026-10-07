import Feature from 'ol/Feature.js'
import { asArray } from 'ol/color.js'
import type { FeatureLike } from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import type { Extent } from 'ol/extent.js'
import type Projection from 'ol/proj/Projection.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import Cluster from 'ol/source/Cluster.js'
import Fill from 'ol/style/Fill.js'
import Icon from 'ol/style/Icon.js'
import RegularShape from 'ol/style/RegularShape.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import Text from 'ol/style/Text.js'
import { bossMarkerShape } from './boss-marker.ts'
import type { EchoDefinition, EchoMapLocation, MapDisplayPoint, NavigationPoint, RegionLabel, RouteResult } from '../domain/types.ts'
import { isMapPointVisibleAtScale, isPointVisibleAtScale, MAP_POINT_DISPLAY_POLICIES } from './point-visibility.ts'
import { gameScaleForResolution } from './map-scale.ts'
import { createPointMarkerStyles, NON_TELEPORT_BRIGHTNESS, NON_TELEPORT_OPACITY } from './point-marker-styles.ts'

class InteractionCluster extends Cluster {
  private readonly isMoving: () => boolean
  private readonly interactionDistance: number

  constructor(source: VectorSource, isMoving: () => boolean, distance: number, minDistance: number) {
    super({ source, distance, minDistance })
    this.isMoving = isMoving
    this.interactionDistance = distance
  }

  override loadFeatures(extent: Extent, resolution: number, projection: Projection): void {
    // Keep clusters for the whole source available while drawing a changing viewport.
    super.loadFeatures(extent, this.isMoving() ? this.resolution ?? resolution : resolution, projection)
  }

  finishInteraction(extent: Extent, resolution: number, projection: Projection, separatePoints: boolean): void {
    const distance = separatePoints ? 0 : this.interactionDistance
    if (this.getDistance() !== distance) this.setDistance(distance)
    super.loadFeatures(extent, resolution, projection)
  }
}

const FLOOR_BADGE_GEOMETRY = {
  radius: 7,
  lowerOffsetY: -1.5,
  upperOffsetY: 1.6,
  upperScaleY: 0.7,
  diamond: { radius: 3, scaleX: 1.15, scaleY: 0.85, strokeWidth: 1.6 },
}

const FLOOR_BADGE_LAYOUT = {
  iconSize: 128,
  height: 46,
  bottom: 5,
  // Keep the horizontal center fixed as the hexagon grows.
  right: 19 - 4 * Math.sqrt(3),
}

const FLOOR_BADGE_COLORS = {
  active: { border: '#e8dd93', lower: '#b1a565', upper: '#fff' },
  otherFloor: { border: '#b8bdc4', lower: '#9aa1ab', upper: '#f4f6f8' },
}

const NAVIGATION_MARKER_SIZE = 36
// Reserve a complete range below teleport markers for the icon and its floor badge.
const NON_TELEPORT_Z_INDEX = -4
// Each integer height owns the full range of marker and floor-badge styles.
const NAVIGATION_HEIGHT_Z_INDEX_STEP = 8
const ECHO_CLUSTER_DISTANCE = 32
const EXPORT_MARKER_SCALE = 0.6

export function mapFeaturePointIds(feature: FeatureLike): string[] | undefined {
  const locations = feature.get('locations') as EchoMapLocation[] | undefined
  if (locations?.length) return locations.map(({ id }) => id)
  const point = feature.get('mapPoint') as MapDisplayPoint | undefined
  return point && point.category !== 'region-name' ? [point.location.id] : undefined
}

export function mapFeaturesPointIds(features: readonly FeatureLike[]): string[] {
  return [...new Set(features.flatMap((feature) => mapFeaturePointIds(feature) ?? []))]
}

export function createPointLayers(isMoving: () => boolean = () => false, options: {
  exportMode?: boolean
  pixelRatio?: number
  echoGrouping?: 'clustered' | 'individual'
  forceVisibleCategory?: () => 'echo' | 'navigation' | null
  onStyleChange?: () => void
} = {}) {
  const echoSource = new VectorSource()
  const exportMarkerScale = options.exportMode ? EXPORT_MARKER_SCALE : 1
  const clusterDistance = ECHO_CLUSTER_DISTANCE * exportMarkerScale
  const clusterMinDistance = options.exportMode ? 0 : ECHO_CLUSTER_DISTANCE
  const clusters = options.echoGrouping === 'individual'
    ? null : new InteractionCluster(echoSource, isMoving, clusterDistance, clusterMinDistance)
  const navigationSource = new VectorSource()
  const backgroundEchoSource = new VectorSource()
  const backgroundClusters = options.echoGrouping === 'individual'
    ? null : new InteractionCluster(backgroundEchoSource, isMoving, clusterDistance, clusterMinDistance)
  const backgroundNavigationSource = new VectorSource()
  const labelSource = new VectorSource()
  const badge = FLOOR_BADGE_GEOMETRY
  let selectedLevelId: string | null = null
  const floorBadgeStyleCache = new globalThis.Map<string, Style[]>()
  let navigationHeightStyles = new WeakMap<Style, Map<number, Style>>()
  // The stem visible above the official badge belongs to its underlying marker, not to the badge itself.
  function floorBadgeStylesFor(markerSize: [number, number], otherFloor: boolean, nonTeleport = false): Style[] {
    const key = `${otherFloor}:${nonTeleport}:${markerSize.map((size) => size.toFixed(3)).join(':')}`
    const cached = floorBadgeStyleCache.get(key)
    if (cached) return cached
    const colors = otherFloor ? FLOOR_BADGE_COLORS.otherFloor : FLOOR_BADGE_COLORS.active
    const zIndex = nonTeleport ? NON_TELEPORT_Z_INDEX : 0
    const badgeColor = (color: string): string => {
      if (!nonTeleport) return color
      const [red = 0, green = 0, blue = 0] = asArray(color)
      const gray = Math.round((red * 0.2126 + green * 0.7152 + blue * 0.0722) * NON_TELEPORT_BRIGHTNESS)
      return `rgb(${gray}, ${gray}, ${gray})`
    }
    const layoutScale = Math.min(...markerSize) / FLOOR_BADGE_LAYOUT.iconSize
    const badgeScale = FLOOR_BADGE_LAYOUT.height * layoutScale / (2 * badge.radius)
    const flatDistance = Math.sqrt(3) * badge.radius * badgeScale
    const scaledBadge = (x: number, y: number): [number, number] => [x * badgeScale, y * badgeScale]
    const x = markerSize[0] / 2
      - FLOOR_BADGE_LAYOUT.right * layoutScale - flatDistance / 2
    const y = -(markerSize[1] / 2
      - FLOOR_BADGE_LAYOUT.bottom * layoutScale - badge.radius * badgeScale)
    const styles = [
      // Layer translucent outlines to soften the shadow without per-point canvases.
      ...[
        { width: 4.5, color: 'rgba(0, 0, 0, 0.08)' },
        { width: 3, color: 'rgba(0, 0, 0, 0.12)' },
        { width: 1.5, color: 'rgba(0, 0, 0, 0.22)' },
      ].map(({ width, color }) => new Style({
        zIndex: zIndex + 0.5,
        image: new RegularShape({
          points: 6,
          radius: badge.radius,
          displacement: [x + 0.6 * badgeScale, y - badgeScale],
          scale: scaledBadge(1, 1),
          fill: new Fill({ color }),
          stroke: new Stroke({ color, width, lineJoin: 'round' }),
        }),
      })),
      new Style({
        zIndex: zIndex + 1,
        image: new RegularShape({
          points: 6,
          radius: badge.radius,
          displacement: [x, y],
          scale: scaledBadge(1, 1),
          fill: new Fill({ color: 'rgba(0, 0, 0, 0.72)' }),
          stroke: new Stroke({ color: badgeColor(colors.border), width: 1.5 }),
        }),
      }),
      new Style({
        zIndex: zIndex + 2,
        image: new RegularShape({
          points: 4,
          radius: badge.diamond.radius,
          displacement: [x, y + badge.lowerOffsetY * badgeScale],
          scale: scaledBadge(badge.diamond.scaleX, badge.diamond.scaleY),
          fill: new Fill({ color: badgeColor(colors.lower) }),
          stroke: new Stroke({ color: badgeColor(colors.lower), width: badge.diamond.strokeWidth, lineJoin: 'miter' }),
        }),
      }),
      new Style({
        zIndex: zIndex + 3,
        image: new RegularShape({
          points: 4,
          radius: badge.diamond.radius,
          displacement: [x, y + badge.upperOffsetY * badgeScale],
          scale: scaledBadge(badge.diamond.scaleX, badge.upperScaleY),
          stroke: new Stroke({ color: badgeColor(colors.upper), width: badge.diamond.strokeWidth, lineJoin: 'miter' }),
        }),
      }),
    ]
    if (nonTeleport) {
      for (const style of styles) style.getImage()?.setOpacity(NON_TELEPORT_OPACITY)
    }
    floorBadgeStyleCache.set(key, styles)
    return styles
  }

  function renderedMarkerSize(styles: readonly Style[]): [number, number] {
    for (const style of styles) {
      const image = style.getImage()
      if (!(image instanceof Icon)) continue
      const width = image.getWidth()
      const height = image.getHeight()
      if (width && height) return [width, height]
    }
    const fallback = NAVIGATION_MARKER_SIZE * exportMarkerScale
    return [fallback, fallback]
  }
  let clusterStyleCache = new WeakMap<FeatureLike, { members: Feature<Point>[]; locations: EchoMapLocation[]; styles: Style[] }>()
  const labelStyleCache = new globalThis.Map<string, Style>()
  let routeTeleportIds = new Set<string>()

  const echoLayer = new VectorLayer({
    source: clusters ?? echoSource,
    zIndex: 40,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: clusters ? clusterStyle : pointStyle,
  })
  const backgroundEchoLayer = new VectorLayer({
    source: backgroundClusters ?? backgroundEchoSource,
    zIndex: 4,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: backgroundClusters ? clusterStyle : pointStyle,
  })
  const navigationLayer = new VectorLayer({
    source: navigationSource,
    zIndex: 50,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: pointStyle,
  })
  const backgroundNavigationLayer = new VectorLayer({
    source: backgroundNavigationSource,
    zIndex: 4,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: pointStyle,
  })
  const labelLayer = new VectorLayer({
    source: labelSource, declutter: true, zIndex: 3, style: pointStyle,
    updateWhileAnimating: true, updateWhileInteracting: true,
  })
  const layers = [labelLayer, echoLayer, navigationLayer, backgroundEchoLayer, backgroundNavigationLayer]
  const markerStyles = createPointMarkerStyles(redrawPointLayers, options)
  const resizedMarkers = new WeakSet()

  function resizeExportMarkers(styles: Style | Style[] | undefined, artworkWidth?: number): void {
    if (!options.exportMode) return
    for (const style of Array.isArray(styles) ? styles : styles ? [styles] : []) {
      const image = style.getImage()
      const width = image?.getSize()?.[0]
      // Set artwork width only after loading; OpenLayers' width callback also
      // runs on image errors, when its intrinsic size is still unavailable.
      if (!image || !width || resizedMarkers.has(image)) continue
      const [x = 1, y = 1] = artworkWidth ? [artworkWidth / width, artworkWidth / width] : image.getScaleArray()
      image.setScale([x * 0.6, y * 0.6])
      resizedMarkers.add(image)
    }
  }

  function redrawPointLayers(): void {
    echoLayer.changed()
    backgroundEchoLayer.changed()
    navigationLayer.changed()
    backgroundNavigationLayer.changed()
    options.onStyleChange?.()
  }

  function clusterStyle(feature: FeatureLike, resolution: number): Style[] | undefined {
    const scale = gameScaleForResolution(resolution)
    const forced = options.exportMode || options.forceVisibleCategory?.() === 'echo'
    if (!forced && !isPointVisibleAtScale(MAP_POINT_DISPLAY_POLICIES.echo, scale)) {
      if (feature instanceof Feature && feature.get('locations')?.length) feature.set('locations', [], true)
      return undefined
    }
    const members = feature.get('features') as Feature<Point>[]
    const cached = clusterStyleCache.get(feature)
    if (cached?.members === members) {
      if (feature instanceof Feature && feature.get('locations') !== cached.locations) feature.set('locations', cached.locations, true)
      return cached.styles
    }
    const locations = members.flatMap((member) => {
      const point = member.get('mapPoint') as MapDisplayPoint
      return point.category === 'echo' && (forced || isMapPointVisibleAtScale(point, scale)) ? [point.location] : []
    })
    if (feature instanceof Feature) feature.set('locations', locations, true)
    if (locations.length === 0) return undefined
    const pointStyles = locations.length === 1 ? markerStyles.echo(locations[0] as EchoMapLocation)
      : markerStyles.echoCluster(locations)
    resizeExportMarkers(pointStyles)
    const styles = pointStyles && locations.some(({ levelId }) => levelId !== null)
      ? [...pointStyles, ...floorBadgeStylesFor(renderedMarkerSize(pointStyles),
        selectedLevelId === null || !locations.some(({ levelId }) => levelId === selectedLevelId))] : pointStyles
    if (styles) clusterStyleCache.set(feature, { members, locations, styles })
    return styles
  }

  function pointFeature(point: MapDisplayPoint): Feature<Point> {
    return new Feature({
      geometry: new Point([point.location.coordinate.mapX, point.location.coordinate.mapY]),
      mapPoint: point,
    })
  }

  function pointStyle(feature: FeatureLike, resolution: number): Style | Style[] | undefined {
    const point = feature.get('mapPoint') as MapDisplayPoint
    const forced = point.category === options.forceVisibleCategory?.()
      || (point.category === 'navigation' && point.location.mode === 'fast-travel' && routeTeleportIds.has(point.location.id))
    if (!options.exportMode && !forced && !isMapPointVisibleAtScale(point, gameScaleForResolution(resolution))) return undefined
    return pointMarkerStyle(point)
  }

  function setVisibleRoutes(routes: readonly RouteResult[]): void {
    const ids = new Set(routes.flatMap(({ points }) => points.flatMap(({ teleportFrom }) => teleportFrom ? [teleportFrom.id] : [])))
    if (ids.size === routeTeleportIds.size && [...ids].every((id) => routeTeleportIds.has(id))) return
    routeTeleportIds = ids
    navigationLayer.changed()
    backgroundNavigationLayer.changed()
  }

  function pointMarkerStyle(point: MapDisplayPoint): Style | Style[] | undefined {
    const style = point.category === 'echo' ? markerStyles.echo(point.location)
      : point.category === 'navigation' ? markerStyles.navigation(point.location) : labelStyle(point.location)
    const nonTeleport = point.category === 'navigation' && point.location.mode !== 'fast-travel'
    if (point.category === 'navigation' && Array.isArray(style)) {
      for (const markerStyle of style) markerStyle.setZIndex(nonTeleport ? NON_TELEPORT_Z_INDEX : 0)
    }
    const artworkWidth = point.category === 'navigation' && point.location.iconUrl && !bossMarkerShape(point.location) ? 36 : undefined
    resizeExportMarkers(style, artworkWidth)
    const showFloorBadge = point.category !== 'region-name'
      && point.location.levelId !== null
      && (point.category !== 'navigation' || point.location.typeName !== '分层入口')
    const styles = showFloorBadge && Array.isArray(style)
      ? [...style, ...floorBadgeStylesFor(renderedMarkerSize(style),
        selectedLevelId === null || point.location.levelId !== selectedLevelId,
        nonTeleport)] : style
    if (point.category !== 'navigation' || !Array.isArray(styles)) return styles
    const height = point.location.gameCoordinate?.z ?? 0
    return styles.map((base) => {
      let byHeight = navigationHeightStyles.get(base)
      if (!byHeight) {
        byHeight = new Map()
        navigationHeightStyles.set(base, byHeight)
      }
      let elevated = byHeight.get(height)
      if (!elevated) {
        elevated = base.clone()
        byHeight.set(height, elevated)
      }
      // Share artwork so asynchronous image loading, grayscale and export sizing stay current.
      const image = base.getImage()
      const text = base.getText()
      if (image) elevated.setImage(image)
      if (text) elevated.setText(text)
      elevated.setZIndex(height * NAVIGATION_HEIGHT_Z_INDEX_STEP + (base.getZIndex() ?? 0))
      return elevated
    })
  }

  function labelStyle(label: RegionLabel): Style {
    const cached = labelStyleCache.get(label.id)
    if (cached) return cached
    const style = new Style({
      text: new Text({
        text: label.name,
        font: label.level === 1 ? '900 20px "Map FangXinShu", sans-serif'
          : label.level === 2 ? '900 16px "Map FangXinShu", sans-serif' : '900 13px "Map FangXinShu", sans-serif',
        fill: new Fill({ color: '#ffffff' }),
      }),
    })
    labelStyleCache.set(label.id, style)
    return style
  }

  function update(
    echoLocations: readonly EchoMapLocation[],
    navigationPoints: readonly NavigationPoint[],
    regionLabels: readonly RegionLabel[],
    echoes: readonly EchoDefinition[],
    activeEchoIds?: ReadonlySet<string>,
    levelId: string | null = null,
  ): void {
    markerStyles.updateEchoes(echoes, activeEchoIds)
    selectedLevelId = levelId
    clusterStyleCache = new WeakMap()
    navigationHeightStyles = new WeakMap()
    echoSource.clear(true)
    navigationSource.clear(true)
    backgroundEchoSource.clear(true)
    backgroundNavigationSource.clear(true)
    labelSource.clear(true)
    labelStyleCache.clear()

    // Independent sources prevent base and floor echoes at the same XY from clustering across the mask.
    const echoFeatures: Feature<Point>[] = []
    const backgroundEchoFeatures: Feature<Point>[] = []
    for (const location of echoLocations) {
      const target = levelId === null || location.levelId === levelId ? echoFeatures : backgroundEchoFeatures
      target.push(pointFeature({ category: 'echo', location }))
    }
    echoSource.addFeatures(echoFeatures)
    backgroundEchoSource.addFeatures(backgroundEchoFeatures)

    const navigationFeatures: Feature<Point>[] = []
    const backgroundNavigationFeatures: Feature<Point>[] = []
    for (const location of navigationPoints) {
      const target = levelId === null || location.levelId !== null || location.mode === 'fast-travel'
        ? navigationFeatures : backgroundNavigationFeatures
      target.push(pointFeature({ category: 'navigation', location }))
    }
    navigationSource.addFeatures(navigationFeatures)
    backgroundNavigationSource.addFeatures(backgroundNavigationFeatures)

    const labels = regionLabels.map((location) => pointFeature({ category: 'region-name', location }))
    labelSource.addFeatures(labels)
  }

  function dispose(): void {
    markerStyles.dispose()
    clusters?.setSource(null)
    clusters?.dispose()
    backgroundClusters?.setSource(null)
    backgroundClusters?.dispose()
    floorBadgeStyleCache.clear()
    labelStyleCache.clear()
    for (const source of [echoSource, navigationSource, labelSource, backgroundEchoSource, backgroundNavigationSource]) {
      source.clear(true)
      source.dispose()
    }
    for (const layer of layers) {
      layer.dispose()
    }
  }

  return {
    layers, update, dispose, setVisibleRoutes,
    ready: markerStyles.ready,
    styleFor: pointMarkerStyle,
    finishInteraction: (extent: Extent, resolution: number, projection: Projection, separatePoints = false) => {
      clusters?.finishInteraction(extent, resolution, projection, separatePoints)
      backgroundClusters?.finishInteraction(extent, resolution, projection, separatePoints)
    },
  }
}
