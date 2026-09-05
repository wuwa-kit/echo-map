import Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import CircleStyle from 'ol/style/Circle.js'
import Fill from 'ol/style/Fill.js'
import Icon from 'ol/style/Icon.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import Text from 'ol/style/Text.js'
import { bossMarkerShape, createPortraitMarkerStyles, PORTRAIT_MARKER_SIZES } from './boss-marker.ts'
import type { EchoDefinition, EchoLocation, NavigationPoint, PointLocationBase, RegionLabel } from '../domain/types.ts'
import { echoLocationMinZoom, isPointVisibleAtZoom, navigationPointMinZoom } from './point-visibility.ts'

export function createPointLayers(zoomForResolution: (resolution: number) => number) {
  const echoSource = new VectorSource()
  const navigationSource = new VectorSource()
  const labelSource = new VectorSource()
  const echoCosts = new globalThis.Map<string, EchoDefinition['cost']>()
  const navigationStyleCache = new globalThis.Map<string, Style[]>()
  const echoMarkerStyles = createPortraitMarkerStyles(() => echoLayer.changed())
  const bossMarkerStyles = createPortraitMarkerStyles(() => navigationLayer.changed())

  const echoLayer = new VectorLayer({
    source: echoSource,
    declutter: true,
    zIndex: 40,
    style(feature, resolution) {
      const location = feature.get('location') as EchoLocation
      return isPointVisibleAtZoom(echoLocationMinZoom(location), zoomForResolution(resolution))
        ? echoStyle(location)
        : undefined
    },
  })
  const navigationLayer = new VectorLayer({
    source: navigationSource,
    zIndex: 50,
    style(feature, resolution) {
      const location = feature.get('location') as NavigationPoint
      return isPointVisibleAtZoom(navigationPointMinZoom(location), zoomForResolution(resolution))
        ? navigationStyle(location)
        : undefined
    },
  })
  const labelLayer = new VectorLayer({ source: labelSource, declutter: true, zIndex: 20 })

  function pointFeature(location: PointLocationBase): Feature<Point> {
    return new Feature({
      geometry: new Point([location.coordinate.mapX, location.coordinate.mapY]),
      location,
    })
  }

  function echoStyle(location: EchoLocation): Style[] | undefined {
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
    if (shape) {
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
    echoLocations: readonly EchoLocation[],
    navigationPoints: readonly NavigationPoint[],
    regionLabels: readonly RegionLabel[],
    echoes: readonly EchoDefinition[],
  ): void {
    echoCosts.clear()
    for (const echo of echoes) {
      echoCosts.set(echo.id, echo.cost)
    }
    echoSource.clear(true)
    navigationSource.clear(true)
    labelSource.clear(true)

    const echoFeatures = echoLocations.map(pointFeature)
    echoSource.addFeatures(echoFeatures)

    const navigationFeatures = navigationPoints.map(pointFeature)
    navigationSource.addFeatures(navigationFeatures)

    const labels = regionLabels.map((label) => {
      const feature = new Feature({ geometry: new Point([label.coordinate.mapX, label.coordinate.mapY]) })
      feature.setStyle(new Style({
        text: new Text({
          text: label.name,
          font: label.level === 2 ? '600 13px sans-serif' : '500 11px sans-serif',
          fill: new Fill({ color: label.level === 2 ? 'rgba(239, 246, 240, .78)' : 'rgba(214, 226, 219, .58)' }),
          stroke: new Stroke({ color: 'rgba(4, 10, 9, .9)', width: 3 }),
        }),
      }))
      return feature
    })
    labelSource.addFeatures(labels)
  }

  function dispose(): void {
    echoMarkerStyles.dispose()
    bossMarkerStyles.dispose()
    echoCosts.clear()
    navigationStyleCache.clear()
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
