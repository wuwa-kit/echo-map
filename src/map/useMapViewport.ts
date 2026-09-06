import View from 'ol/View.js'
import type Map from 'ol/Map.js'
import type Projection from 'ol/proj/Projection.js'
import { getCenter, isEmpty } from 'ol/extent.js'
import type { Extent } from 'ol/extent.js'
import type { MapStateDefinition } from '../domain/types.ts'
import type { MapViewportState } from '../url/explorer-url.ts'
import { fitMapPadding } from './viewport-padding.ts'
import type { MapPadding } from './viewport-padding.ts'

interface MapViewportOptions {
  getMap: () => Pick<Map, 'getView' | 'setView' | 'getSize'> | null
  getPadding: () => MapPadding
  getSavedViewport: () => MapViewportState | null
  onViewportChanged: (viewport: MapViewportState | null) => void
}

function matchesViewport(viewport: MapViewportState, reference: MapViewportState | null): boolean {
  return reference !== null
    && Math.abs(viewport.center[0] - reference.center[0]) < 0.01
    && Math.abs(viewport.center[1] - reference.center[1]) < 0.01
    && Math.abs(viewport.zoom - reference.zoom) < 0.0001
}

export function useMapViewport(options: MapViewportOptions) {
  let defaultViewport: MapViewportState | null = null
  let routeViewport: MapViewportState | null = null

  function current(): MapViewportState | null {
    const view = options.getMap()?.getView()
    const center = view?.getCenter()
    const zoom = view?.getZoom()
    const x = center?.[0]
    const y = center?.[1]
    return x === undefined || y === undefined || zoom === undefined ? null : { center: [x, y], zoom }
  }

  function publish(): void {
    const viewport = current()
    if (viewport) {
      options.onViewportChanged(matchesViewport(viewport, defaultViewport) ? null : viewport)
    }
  }

  function configureBaseView(state: MapStateDefinition, projection: Projection): void {
    const map = options.getMap()
    if (!map) {
      return
    }
    const size = Math.max(
      state.tileExtent.extent[2] - state.tileExtent.extent[0],
      state.tileExtent.extent[3] - state.tileExtent.extent[1],
    )
    const view = new View({
      projection,
      enableRotation: false,
      center: getCenter(state.tileExtent.extent),
      extent: state.tileExtent.extent,
      resolution: Math.max(1, size / 1300),
      minResolution: 0.14,
      maxResolution: Math.max(2, size / 500),
      constrainOnlyCenter: true,
    })
    const center = view.getCenter()
    const x = center?.[0]
    const y = center?.[1]
    const zoom = view.getZoom()
    defaultViewport = x !== undefined && y !== undefined && zoom !== undefined ? { center: [x, y], zoom } : null
    const saved = options.getSavedViewport()
    if (saved) {
      view.setCenter([...saved.center])
      view.setZoom(saved.zoom)
    }
    map.setView(view)
  }

  // Only called once for a legacy floor URL without an explicit viewport.
  function restoreFloorViewport(extent: Extent | null): void {
    const map = options.getMap()
    if (!map || !extent || isEmpty(extent) || options.getSavedViewport() !== null) {
      return
    }
    const [width = 0, height = 0] = map.getSize() ?? []
    if (width <= 0 || height <= 0) {
      return
    }
    map.getView().fit(extent, {
      padding: fitMapPadding(width, height, options.getPadding()),
      minResolution: 0.5,
    })
    publish()
  }

  function resetRoute(): void {
    routeViewport = null
  }

  function locate(center: [number, number]): void {
    const map = options.getMap()
    const [width = 0, height = 0] = map?.getSize() ?? []
    if (!map || width <= 0 || height <= 0) return
    const [top, right, bottom, left] = fitMapPadding(width, height, options.getPadding())
    const view = map.getView()
    view.cancelAnimations()
    view.setResolution(2.3)
    view.centerOn(center, [width, height], [(left + width - right) / 2, (top + height - bottom) / 2])
    publish()
  }

  function fitRoute(extent: Extent | null | undefined): void {
    const map = options.getMap()
    const viewport = current()
    if (!map || !extent || isEmpty(extent) || !viewport) {
      return
    }
    // Refit around changing panels until the user deliberately moves the map.
    if (routeViewport && !matchesViewport(viewport, routeViewport)) {
      return
    }
    const [width = 0, height = 0] = map.getSize() ?? []
    map.getView().fit(extent, {
      padding: fitMapPadding(width, height, options.getPadding()),
      minResolution: 0.5,
    })
    routeViewport = current()
    publish()
  }

  return { configureBaseView, restoreFloorViewport, fitRoute, resetRoute, publish, locate }
}
