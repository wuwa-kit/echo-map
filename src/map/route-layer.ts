import Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import LineString from 'ol/geom/LineString.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import CircleStyle from 'ol/style/Circle.js'
import Fill from 'ol/style/Fill.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import Text from 'ol/style/Text.js'
import type { NavigationPoint, RouteResult } from '../domain/types.ts'

export function createRouteLayer() {
  const routeSource = new VectorSource()
  const layer = new VectorLayer({ source: routeSource, zIndex: 60 })

  function update(route: RouteResult | null, start: NavigationPoint | undefined): void {
    routeSource.clear(true)
    if (!route || route.points.length === 0) {
      return
    }
    const coordinates: [number, number][] = []
    if (route.startPointId && start) {
      coordinates.push([start.coordinate.mapX, start.coordinate.mapY])
    }
    coordinates.push(...route.points.map(({ mapCoordinate }) => mapCoordinate))
    const line = new Feature({ geometry: new LineString(coordinates) })
    line.setStyle(new Style({
      stroke: new Stroke({ color: '#65f1c2', width: 3, lineDash: [9, 7] }),
    }))
    routeSource.addFeature(line)
    route.points.forEach((point, index) => {
      const marker = new Feature({ geometry: new Point(point.mapCoordinate) })
      marker.setStyle(new Style({
        image: new CircleStyle({
          radius: 11,
          fill: new Fill({ color: '#d8fff1' }),
          stroke: new Stroke({ color: '#0b3c31', width: 2 }),
        }),
        text: new Text({
          text: String(index + 1),
          font: '700 11px sans-serif',
          fill: new Fill({ color: '#08241e' }),
        }),
      }))
      routeSource.addFeature(marker)
    })
  }

  function dispose(): void {
    routeSource.clear(true)
    routeSource.dispose()
    layer.dispose()
  }

  return { layer, update, getExtent: () => routeSource.getExtent(), dispose }
}
