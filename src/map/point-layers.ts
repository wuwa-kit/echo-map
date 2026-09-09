import Feature from 'ol/Feature.js'
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
import type { EchoDefinition, EchoMapLocation, MapDisplayPoint, NavigationPoint, RegionLabel } from '../domain/types.ts'
import { isMapPointVisibleAtZoom, isPointVisibleAtZoom, MAP_POINT_ZOOM_RANGES, mapZoomForResolution } from './point-visibility.ts'
import { createPointMarkerStyles } from './point-marker-styles.ts'

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
  lower: { offsetY: -1.25, radius: 3, scaleX: 1.08, scaleY: 0.65 },
  upper: { offsetY: 2.5, radius: 3, scaleX: 1.15, scaleY: 0.7 },
}

const FLOOR_BADGE_LAYOUT = {
  iconSize: 260,
  flatDistance: 50,
  bottom: 30,
  right: 70,
}

const NAVIGATION_MARKER_SIZE = 36
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
  const floorBadgeStyleCache = new globalThis.Map<string, Style[]>()
  // The stem visible above the official badge belongs to its underlying marker, not to the badge itself.
  function floorBadgeStylesFor(markerSize: [number, number]): Style[] {
    const key = markerSize.map((size) => size.toFixed(3)).join(':')
    const cached = floorBadgeStyleCache.get(key)
    if (cached) return cached
    const layoutScale = Math.min(...markerSize) / FLOOR_BADGE_LAYOUT.iconSize
    const flatDistance = FLOOR_BADGE_LAYOUT.flatDistance * layoutScale
    const badgeScale = flatDistance / (Math.sqrt(3) * badge.radius)
    const scaledBadge = (x: number, y: number): [number, number] => [x * badgeScale, y * badgeScale]
    const x = markerSize[0] / 2
      - FLOOR_BADGE_LAYOUT.right * layoutScale - flatDistance / 2
    const y = -(markerSize[1] / 2
      - FLOOR_BADGE_LAYOUT.bottom * layoutScale - badge.radius * badgeScale)
    const styles = [
      new Style({
        zIndex: 1,
        image: new RegularShape({
          points: 6,
          radius: badge.radius,
          displacement: [x, y],
          scale: scaledBadge(1, 1),
          fill: new Fill({ color: 'rgba(0, 0, 0, 0.72)' }),
          stroke: new Stroke({ color: '#e8dd93', width: 1.5 }),
        }),
      }),
      new Style({
        zIndex: 2,
        image: new RegularShape({
          points: 4,
          radius: badge.lower.radius,
          displacement: [x, y + badge.lower.offsetY * badgeScale],
          scale: scaledBadge(badge.lower.scaleX, badge.lower.scaleY),
          fill: new Fill({ color: '#7c754e' }),
        }),
      }),
      new Style({
        zIndex: 3,
        image: new RegularShape({
          points: 4,
          radius: badge.upper.radius,
          displacement: [x, y + badge.upper.offsetY * badgeScale],
          scale: scaledBadge(badge.upper.scaleX, badge.upper.scaleY),
          stroke: new Stroke({ color: '#fff', width: 1.2 }),
        }),
      }),
    ]
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
  let selectedLevelId: string | null = null

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
    const zoom = mapZoomForResolution(resolution)
    if (!options.exportMode && !isPointVisibleAtZoom(MAP_POINT_ZOOM_RANGES.echo, zoom)) {
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
      return point.category === 'echo' && (options.exportMode || isMapPointVisibleAtZoom(point, zoom)) ? [point.location] : []
    })
    if (feature instanceof Feature) feature.set('locations', locations, true)
    if (locations.length === 0) return undefined
    const pointStyles = locations.length === 1 ? markerStyles.echo(locations[0] as EchoMapLocation)
      : markerStyles.echoCluster(locations)
    resizeExportMarkers(pointStyles)
    const styles = pointStyles && selectedLevelId === null && locations.some(({ levelId }) => levelId !== null)
      ? [...pointStyles, ...floorBadgeStylesFor(renderedMarkerSize(pointStyles))] : pointStyles
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
    if (!options.exportMode && !isMapPointVisibleAtZoom(point, mapZoomForResolution(resolution))) return undefined
    const style = point.category === 'echo' ? markerStyles.echo(point.location)
      : point.category === 'navigation' ? markerStyles.navigation(point.location) : labelStyle(point.location)
    const artworkWidth = point.category === 'navigation' && point.location.iconUrl && !bossMarkerShape(point.location) ? 36 : undefined
    resizeExportMarkers(style, artworkWidth)
    const showFloorBadge = point.category !== 'region-name' && selectedLevelId === null
      && point.location.levelId !== null
      && (point.category !== 'navigation' || point.location.typeName !== '分层入口')
    return showFloorBadge && Array.isArray(style)
      ? [...style, ...floorBadgeStylesFor(renderedMarkerSize(style))] : style
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
      const target = levelId === null || location.levelId === levelId || location.mode === 'fast-travel'
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
    layers, update, dispose,
    ready: markerStyles.ready,
    styleFor: (point: MapDisplayPoint) => point.category === 'echo' ? markerStyles.echo(point.location)
      : point.category === 'navigation' ? markerStyles.navigation(point.location) : labelStyle(point.location),
    finishInteraction: (extent: Extent, resolution: number, projection: Projection, separatePoints = false) => {
      clusters?.finishInteraction(extent, resolution, projection, separatePoints)
      backgroundClusters?.finishInteraction(extent, resolution, projection, separatePoints)
    },
  }
}
