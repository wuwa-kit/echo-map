import Feature from 'ol/Feature.js'
import type { FeatureLike } from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import Cluster from 'ol/source/Cluster.js'
import CircleStyle from 'ol/style/Circle.js'
import Fill from 'ol/style/Fill.js'
import Icon from 'ol/style/Icon.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import Text from 'ol/style/Text.js'
import { bossMarkerShape, createPortraitMarkerStyles, PORTRAIT_MARKER_SIZES } from './boss-marker.ts'
import type { EchoDefinition, EchoMapLocation, MapDisplayPoint, NavigationPoint, RegionLabel } from '../domain/types.ts'
import { echoMembers, NAVIGATION_NAMES } from '../domain/point-library.ts'
import { createEchoMarkerStyles } from './echo-marker.ts'
import { isMapPointVisibleAtZoom, mapZoomForResolution } from './point-visibility.ts'

export function mapFeaturePointIds(feature: FeatureLike): string[] | undefined {
  const locations = feature.get('locations') as EchoMapLocation[] | undefined
  if (locations?.length) return locations.map(({ id }) => id)
  const point = feature.get('mapPoint') as MapDisplayPoint | undefined
  return point && point.category !== 'region-name' ? [point.location.id] : undefined
}

export function createPointLayers() {
  const echoSource = new VectorSource()
  const clusters = new Cluster({ source: echoSource, distance: 64, minDistance: 32 })
  const navigationSource = new VectorSource()
  const labelSource = new VectorSource()
  const echoCosts = new globalThis.Map<string, EchoDefinition['cost']>()
  const navigationStyleCache = new globalThis.Map<string, Style[]>()
  const labelStyleCache = new globalThis.Map<string, Style>()
  const echoMarkerStyles = createPortraitMarkerStyles(() => echoLayer.changed())
  const groupMarkerStyles = createEchoMarkerStyles(() => echoLayer.changed())
  let echoDefinitions: readonly EchoDefinition[] = []
  let selectedEchoIds: ReadonlySet<string> | undefined
  const bossMarkerStyles = createPortraitMarkerStyles(() => navigationLayer.changed())

  const echoLayer = new VectorLayer({
    source: clusters,
    zIndex: 40,
    style(feature, resolution) {
      const members = feature.get('features') as Feature<Point>[]
      const zoom = mapZoomForResolution(resolution)
      const locations = members.flatMap((member) => {
        const point = member.get('mapPoint') as MapDisplayPoint
        return point.category === 'echo' && isMapPointVisibleAtZoom(point, zoom) ? [point.location] : []
      })
      if (feature instanceof Feature) feature.set('locations', locations, true)
      if (locations.length === 0) return undefined
      if (locations.length === 1) return echoStyle(locations[0] as EchoMapLocation)
      const composition = locations.flatMap((location) => echoMembers(location))
        .filter(({ echoId }) => !selectedEchoIds || selectedEchoIds.has(echoId))
      return groupMarkerStyles.get(composition, echoDefinitions, { showText: false }).styles
    },
  })
  const navigationLayer = new VectorLayer({
    source: navigationSource,
    zIndex: 50,
    style: pointStyle,
  })
  const labelLayer = new VectorLayer({ source: labelSource, declutter: true, zIndex: 20, style: pointStyle })

  function pointFeature(point: MapDisplayPoint): Feature<Point> {
    return new Feature({
      geometry: new Point([point.location.coordinate.mapX, point.location.coordinate.mapY]),
      mapPoint: point,
    })
  }

  function pointStyle(feature: FeatureLike, resolution: number): Style | Style[] | undefined {
    const point = feature.get('mapPoint') as MapDisplayPoint
    if (!isMapPointVisibleAtZoom(point, mapZoomForResolution(resolution))) return undefined
    switch (point.category) {
      case 'echo': return echoStyle(point.location)
      case 'navigation': return navigationStyle(point.location)
      case 'region-name': return labelStyle(point.location)
    }
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
  ): void {
    echoDefinitions = echoes
    selectedEchoIds = activeEchoIds
    echoCosts.clear()
    for (const echo of echoes) {
      echoCosts.set(echo.id, echo.cost)
    }
    echoSource.clear(true)
    navigationSource.clear(true)
    labelSource.clear(true)
    labelStyleCache.clear()

    const echoFeatures = echoLocations.map((location) => pointFeature({ category: 'echo', location }))
    echoSource.addFeatures(echoFeatures)

    const navigationFeatures = navigationPoints.map((location) => pointFeature({ category: 'navigation', location }))
    navigationSource.addFeatures(navigationFeatures)

    const labels = regionLabels.map((location) => pointFeature({ category: 'region-name', location }))
    labelSource.addFeatures(labels)
  }

  function dispose(): void {
    echoMarkerStyles.dispose()
    groupMarkerStyles.dispose()
    clusters.setSource(null)
    clusters.dispose()
    bossMarkerStyles.dispose()
    echoCosts.clear()
    navigationStyleCache.clear()
    labelStyleCache.clear()
    for (const source of [echoSource, navigationSource, labelSource]) {
      source.clear(true)
      source.dispose()
    }
    for (const layer of [echoLayer, navigationLayer, labelLayer]) {
      layer.dispose()
    }
  }

  return { layers: [labelLayer, echoLayer, navigationLayer], update, dispose }
}
