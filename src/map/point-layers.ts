import Feature from 'ol/Feature.js'
import type { FeatureLike } from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import type { Extent } from 'ol/extent.js'
import type Projection from 'ol/proj/Projection.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import Cluster from 'ol/source/Cluster.js'
import CircleStyle from 'ol/style/Circle.js'
import Fill from 'ol/style/Fill.js'
import Icon from 'ol/style/Icon.js'
import ImageState from 'ol/ImageState.js'
import { shared as iconImageCache } from 'ol/style/IconImageCache.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import Text from 'ol/style/Text.js'
import { bossMarkerShape, createPortraitMarkerStyles, PORTRAIT_MARKER_SIZES } from './boss-marker.ts'
import type { EchoDefinition, EchoMapLocation, MapDisplayPoint, NavigationPoint, RegionLabel } from '../domain/types.ts'
import { echoMembers, NAVIGATION_NAMES } from '../domain/point-library.ts'
import { createEchoMarkerStyles } from './echo-marker.ts'
import { isMapPointVisibleAtZoom, isPointVisibleAtZoom, MAP_POINT_ZOOM_RANGES, mapZoomForResolution } from './point-visibility.ts'

class InteractionCluster extends Cluster {
  private readonly isMoving: () => boolean

  constructor(source: VectorSource, isMoving: () => boolean) {
    super({ source, distance: 64, minDistance: 32 })
    this.isMoving = isMoving
  }

  override loadFeatures(extent: Extent, resolution: number, projection: Projection): void {
    // Keep clusters for the whole source available while drawing a changing viewport.
    super.loadFeatures(extent, this.isMoving() ? this.resolution ?? resolution : resolution, projection)
  }

  finishInteraction(extent: Extent, resolution: number, projection: Projection): void {
    super.loadFeatures(extent, resolution, projection)
  }
}

export function mapFeaturePointIds(feature: FeatureLike): string[] | undefined {
  const locations = feature.get('locations') as EchoMapLocation[] | undefined
  if (locations?.length) return locations.map(({ id }) => id)
  const point = feature.get('mapPoint') as MapDisplayPoint | undefined
  return point && point.category !== 'region-name' ? [point.location.id] : undefined
}

export function createPointLayers(isMoving: () => boolean = () => false, options: { exportMode?: boolean; pixelRatio?: number } = {}) {
  const echoSource = new VectorSource()
  const clusters = new InteractionCluster(echoSource, isMoving)
  const navigationSource = new VectorSource()
  const backgroundEchoSource = new VectorSource()
  const backgroundClusters = new InteractionCluster(backgroundEchoSource, isMoving)
  if (options.exportMode) {
    clusters.setDistance(18)
    clusters.setMinDistance(0)
    backgroundClusters.setDistance(18)
    backgroundClusters.setMinDistance(0)
  }
  const backgroundNavigationSource = new VectorSource()
  const labelSource = new VectorSource()
  const echoCosts = new globalThis.Map<string, EchoDefinition['cost']>()
  let clusterStyleCache = new WeakMap<FeatureLike, { members: Feature<Point>[]; locations: EchoMapLocation[]; styles: Style[] }>()
  const navigationStyleCache = new globalThis.Map<string, Style[]>()
  const labelStyleCache = new globalThis.Map<string, Style>()
  const echoMarkerStyles = createPortraitMarkerStyles(redrawEchoLayers, options.pixelRatio)
  const groupMarkerStyles = createEchoMarkerStyles(redrawEchoLayers, options.pixelRatio)
  let echoDefinitions: readonly EchoDefinition[] = []
  let selectedEchoIds: ReadonlySet<string> | undefined
  const bossMarkerStyles = createPortraitMarkerStyles(() => {
    navigationLayer.changed()
    backgroundNavigationLayer.changed()
  }, options.pixelRatio)

  const echoLayer = new VectorLayer({
    source: clusters,
    zIndex: 40,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: clusterStyle,
  })
  const backgroundEchoLayer = new VectorLayer({
    source: backgroundClusters,
    zIndex: 4,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: clusterStyle,
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

  function redrawEchoLayers(): void {
    echoLayer.changed()
    backgroundEchoLayer.changed()
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
    const styles = locations.length === 1 ? echoStyle(locations[0] as EchoMapLocation)
      : groupMarkerStyles.get(locations.flatMap((location) => echoMembers(location))
        .filter(({ echoId }) => !selectedEchoIds || selectedEchoIds.has(echoId)), echoDefinitions, { showText: false }).styles
    resizeExportMarkers(styles)
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
    const style = point.category === 'echo' ? echoStyle(point.location)
      : point.category === 'navigation' ? navigationStyle(point.location) : labelStyle(point.location)
    const artworkWidth = point.category === 'navigation' && point.location.iconUrl && !bossMarkerShape(point.location) ? 36 : undefined
    resizeExportMarkers(style, artworkWidth)
    return style
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

  function echoStyle(location: EchoMapLocation): Style[] | undefined {
    if ('members' in location) return groupMarkerStyles.get(echoMembers(location).filter(({ echoId }) => !selectedEchoIds || selectedEchoIds.has(echoId)), echoDefinitions).styles
    const cost = echoCosts.get(location.echoId)
    if (cost === undefined) {
      return undefined
    }
    return echoMarkerStyles.getStyle({
      shape: 'diamond',
      size: PORTRAIT_MARKER_SIZES[cost],
      iconUrl: location.iconUrl,
      opacity: location.gameCoordinate !== null ? 1 : 0.82,
    }) ?? undefined
  }

  function navigationStyle(location: NavigationPoint): Style[] {
    const shape = bossMarkerShape(location)
    if (shape && location.iconUrl) {
      const bossStyles = bossMarkerStyles.getStyle({
        shape,
        size: PORTRAIT_MARKER_SIZES[4],
        iconUrl: location.iconUrl,
        opacity: location.mode === 'fast-travel' ? 1 : 0.48,
      })
      if (bossStyles) {
        return bossStyles
      }
    }
    const key = `${location.typeId}:${location.mode}:${location.iconUrl}`
    const cached = navigationStyleCache.get(key)
    if (cached) {
      return cached
    }
    // A new exporter must retry failed artwork instead of inheriting an ERROR
    // image from OpenLayers' shared cache. Keep loaded and pending images intact.
    if (options.exportMode && location.iconUrl && iconImageCache.get(location.iconUrl, null)?.getImageState() === ImageState.ERROR) {
      iconImageCache.set(location.iconUrl, null, null)
    }
    const isFastTravel = location.mode === 'fast-travel'
    const styles = [new Style({
      text: !location.iconUrl ? new Text({ text: NAVIGATION_NAMES[location.kind], offsetY: 18, font: '11px sans-serif', fill: new Fill({ color: '#cde8dc' }), stroke: new Stroke({ color: '#07120e', width: 3 }) }) : undefined,
      image: location.iconUrl
        ? new Icon({
          src: location.iconUrl,
          crossOrigin: 'anonymous',
          scale: 0.28,
          opacity: isFastTravel ? 1 : 0.48,
        })
        : new CircleStyle({
          radius: 6,
          fill: new Fill({ color: isFastTravel ? '#65f1c2' : 'rgba(151, 169, 162, 0.48)' }),
        }),
    })]
    navigationStyleCache.set(key, styles)
    return styles
  }

  function update(
    echoLocations: readonly EchoMapLocation[],
    navigationPoints: readonly NavigationPoint[],
    regionLabels: readonly RegionLabel[],
    echoes: readonly EchoDefinition[],
    activeEchoIds?: ReadonlySet<string>,
    levelId: string | null = null,
  ): void {
    echoDefinitions = echoes
    selectedEchoIds = activeEchoIds
    clusterStyleCache = new WeakMap()
    echoCosts.clear()
    for (const echo of echoes) {
      echoCosts.set(echo.id, echo.cost)
    }
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
    echoMarkerStyles.dispose()
    groupMarkerStyles.dispose()
    clusters.setSource(null)
    clusters.dispose()
    backgroundClusters.setSource(null)
    backgroundClusters.dispose()
    bossMarkerStyles.dispose()
    echoCosts.clear()
    navigationStyleCache.clear()
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
    ready: async () => {
      await Promise.all([echoMarkerStyles.ready(), groupMarkerStyles.ready(), bossMarkerStyles.ready(), ...[...navigationStyleCache.values()].flatMap((styles) => styles.flatMap((style) => {
        const image = style.getImage()?.getImage(1)
        return image instanceof HTMLImageElement ? [image.decode()] : []
      }))])
    },
    finishInteraction: (extent: Extent, resolution: number, projection: Projection) => {
      clusters.finishInteraction(extent, resolution, projection)
      backgroundClusters.finishInteraction(extent, resolution, projection)
    },
  }
}
