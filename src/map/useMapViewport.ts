import View from 'ol/View.js'
import type Map from 'ol/Map.js'
import type Projection from 'ol/proj/Projection.js'
import { getCenter, isEmpty } from 'ol/extent.js'
import type { Extent } from 'ol/extent.js'
import type { MapStateDefinition } from '../domain/types.ts'
import type { MapViewportState } from '../url/explorer-url.ts'
import { mapResolutionForZoom, mapZoomForResolution } from './map-scale.ts'
import { fitMapPadding } from './viewport-padding.ts'
import type { MapPadding } from './viewport-padding.ts'

interface MapViewportOptions {
  getMap: () => Pick<Map, 'getView' | 'setView' | 'getSize'> | null
  getPadding: () => MapPadding
  getSavedViewport: () => MapViewportState | null
  onViewportChanged: (viewport: MapViewportState | null) => void
}

// OpenLayers continues to constrain resolutions; its public zoom conversion uses our fixed scale.
class MapView extends View {
  override getZoomForResolution(resolution: number): number {
    return mapZoomForResolution(resolution)
  }

  override getResolutionForZoom(zoom: number): number {
    return mapResolutionForZoom(zoom)
  }
}

export function createMapView(state: MapStateDefinition, projection: Projection): View {
  const size = Math.max(
    state.tileExtent.extent[2] - state.tileExtent.extent[0],
    state.tileExtent.extent[3] - state.tileExtent.extent[1],
  )
  return new MapView({
    projection,
    enableRotation: false,
    center: getCenter(state.tileExtent.extent),
    extent: state.tileExtent.extent,
    resolution: mapResolutionForZoom(-2),
    minResolution: mapResolutionForZoom(3),
    // Allow a full-map fit even with only a small usable area beside the panels.
    maxResolution: mapResolutionForZoom(Math.min(-2, Math.floor(mapZoomForResolution(size / 48)))),
    constrainOnlyCenter: true,
  })
}

function matchesViewport(viewport: MapViewportState, reference: MapViewportState | null): boolean {
  return reference !== null
    && Math.abs(viewport.center[0] - reference.center[0]) < 0.01
    && Math.abs(viewport.center[1] - reference.center[1]) < 0.01
    && Math.abs(viewport.zoom - reference.zoom) < 0.0001
}

export function useMapViewport(options: MapViewportOptions) {
  let defaultViewport: MapViewportState | null = null
  let pendingInitialState: MapStateDefinition | null = null
  let initialSavedViewport: MapViewportState | null = null
  let pendingFloorExtent: Extent | null = null

  function current(): MapViewportState | null {
    const view = options.getMap()?.getView()
    const center = view?.getCenter()
    const zoom = view?.getZoom()
    const x = center?.[0]
    const y = center?.[1]
    return x === undefined || y === undefined || zoom === undefined ? null : { center: [x, y], zoom }
  }

  function publish(): void {
    if (pendingInitialState) return
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
    initialSavedViewport = options.getSavedViewport()
    pendingInitialState = state
    pendingFloorExtent = null
    defaultViewport = null
    map.setView(createMapView(state, projection))
    initializeViewport()
  }

  // A hidden/zero-sized target is fitted once when it first becomes measurable.
  function initializeViewport(): void {
    const map = options.getMap()
    const state = pendingInitialState
    const [width = 0, height = 0] = map?.getSize() ?? []
    if (!map || !state || width <= 0 || height <= 0) return
    const view = map.getView()
    view.fit(state.tileExtent.extent, {
      size: [width, height],
      padding: fitMapPadding(width, height, options.getPadding()),
    })
    defaultViewport = current()
    pendingInitialState = null
    const saved = initialSavedViewport
    initialSavedViewport = null
    if (saved && saved.center.every(Number.isFinite) && Number.isFinite(mapResolutionForZoom(saved.zoom))) {
      view.setCenter(saved.center)
      view.setZoom(saved.zoom)
    }
    const floorExtent = pendingFloorExtent
    pendingFloorExtent = null
    if (floorExtent) restoreFloorViewport(floorExtent)
  }

  // Only called once for a legacy floor URL without an explicit viewport.
  function restoreFloorViewport(extent: Extent | null): void {
    const map = options.getMap()
    if (!map || !extent || isEmpty(extent) || options.getSavedViewport() !== null) {
      return
    }
    if (pendingInitialState) {
      pendingFloorExtent = [...extent]
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

  function containsCoordinate(coordinate: [number, number]): boolean {
    const map = options.getMap()
    const [width = 0, height = 0] = map?.getSize() ?? []
    if (!map || width <= 0 || height <= 0 || !coordinate.every(Number.isFinite)) return false
    const view = map.getView()
    const resolution = view.getResolution()
    if (!resolution || view.getAnimating() || view.getInteracting()) return false
    const [minX, minY, maxX, maxY] = view.calculateExtent([width, height])
    if (minX === undefined || minY === undefined || maxX === undefined || maxY === undefined) return false
    const [top, right, bottom, left] = fitMapPadding(width, height, options.getPadding())
    const horizontalMargin = (width - left - right) * 0.25
    const verticalMargin = (height - top - bottom) * 0.25
    return coordinate[0] > minX + (left + horizontalMargin) * resolution && coordinate[0] < maxX - (right + horizontalMargin) * resolution
      && coordinate[1] > minY + (bottom + verticalMargin) * resolution && coordinate[1] < maxY - (top + verticalMargin) * resolution
  }

  function locate(center: [number, number], resolution?: number): boolean {
    const map = options.getMap()
    const [width = 0, height = 0] = map?.getSize() ?? []
    if (!map || width <= 0 || height <= 0 || !center.every(Number.isFinite)) return false
    const [top, right, bottom, left] = fitMapPadding(width, height, options.getPadding())
    const view = map.getView()
    view.cancelAnimations()
    if (resolution !== undefined) view.setResolution(resolution)
    view.centerOn(center, [width, height], [(left + width - right) / 2, (top + height - bottom) / 2])
    publish()
    return containsCoordinate(center)
  }

  return { configureBaseView, initializeViewport, restoreFloorViewport, publish, locate, containsCoordinate }
}
