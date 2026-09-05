<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useResizeObserver } from '@vueuse/core'
import Feature from 'ol/Feature.js'
import type { FeatureLike } from 'ol/Feature.js'
import Map from 'ol/Map.js'
import type MapBrowserEvent from 'ol/MapBrowserEvent.js'
import View from 'ol/View.js'
import { defaults as defaultControls } from 'ol/control/defaults.js'
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js'
import { createEmpty, extend, getCenter, isEmpty } from 'ol/extent.js'
import type { Extent } from 'ol/extent.js'
import Point from 'ol/geom/Point.js'
import LineString from 'ol/geom/LineString.js'
import ImageLayer from 'ol/layer/Image.js'
import VectorLayer from 'ol/layer/Vector.js'
import Projection from 'ol/proj/Projection.js'
import ImageStatic from 'ol/source/ImageStatic.js'
import VectorSource from 'ol/source/Vector.js'
import CircleStyle from 'ol/style/Circle.js'
import Fill from 'ol/style/Fill.js'
import Icon from 'ol/style/Icon.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import Text from 'ol/style/Text.js'
import { useExplorerStore } from '../stores/explorer.ts'
import { layeredTileExtent, mapToGameCoordinate } from '../map/projection.ts'
import { createOfficialTileLayer, layeredTileUrl } from '../map/official-source.ts'
import { createBossMarkerStyles } from '../map/boss-marker.ts'
import { echoLocationMinZoom, isPointVisibleAtZoom, navigationPointMinZoom } from '../map/point-visibility.ts'
import type { EchoLocation, NavigationPoint, PointLocationBase } from '../domain/types.ts'
import type { MapViewportState } from '../url/explorer-url.ts'
import { fitMapPadding } from '../map/viewport-padding.ts'
import type { MapPadding } from '../map/viewport-padding.ts'

const props = defineProps<{ padding: MapPadding }>()

const store = useExplorerStore()
const {
  activeState,
  dataset,
  mapViewport,
  route,
  selectedLevelId,
  visibleEchoLocations,
  visibleNavigationPoints,
  visibleRegionLabels,
} = storeToRefs(store)
const mapTarget = useTemplateRef<HTMLElement>('mapTargetRef')
const pointerCoordinate = shallowRef<[number, number] | null>(null)
const pointerCoordinateText = computed(() => {
  const coordinate = pointerCoordinate.value
  const tileWidth = dataset.value?.source.tileWidth
  if (!coordinate || tileWidth === undefined) {
    return null
  }
  const [x, y] = mapToGameCoordinate(coordinate[0], coordinate[1], tileWidth)
  return `X ${Math.round(x)} · Y ${Math.round(y)}`
})
const echoSource = new VectorSource()
const navigationSource = new VectorSource()
const labelSource = new VectorSource()
const routeSource = new VectorSource()
const echoStyleCache = new globalThis.Map<string, Style>()
const navigationStyleCache = new globalThis.Map<string, Style[]>()
const bossMarkerStyles = createBossMarkerStyles(() => navigationLayer.changed())

const projection = new Projection({
  code: 'KURO:CRS-SIMPLE',
  units: 'pixels',
})

const echoLayer = new VectorLayer({
  source: echoSource,
  declutter: true,
  zIndex: 40,
  style(feature, resolution) {
    const location = feature.get('location') as EchoLocation
    return isPointVisibleAtZoom(echoLocationMinZoom(location), zoomForResolution(resolution))
      ? echoStyle(feature)
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
const routeLayer = new VectorLayer({ source: routeSource, zIndex: 60 })
let map: Map | null = null
let defaultViewport: MapViewportState | null = null
let baseViewport: MapViewportState | null = null
let baseLayer: ReturnType<typeof createOfficialTileLayer> | null = null
let floorLayers: ImageLayer<ImageStatic>[] = []
let floorExtent: Extent | null = null
let routeViewport: MapViewportState | null = null

useResizeObserver(mapTarget, () => {
  map?.updateSize()
  fitFloorViewport()
  fitRouteViewport()
})

function fitFloorViewport(): void {
  if (!map || !floorExtent || mapViewport.value !== null) {
    return
  }
  const [width = 0, height = 0] = map.getSize() ?? []
  if (width <= 0 || height <= 0) {
    return
  }
  map.getView().fit(floorExtent, {
    padding: fitMapPadding(width, height, props.padding),
    minResolution: 0.5,
  })
  defaultViewport = currentMapViewport()
}

function zoomForResolution(resolution: number): number {
  return map?.getView().getZoomForResolution(resolution) ?? Number.POSITIVE_INFINITY
}

function pointFeature(location: PointLocationBase): Feature<Point> {
  return new Feature({
    geometry: new Point([location.coordinate.mapX, location.coordinate.mapY]),
    location,
  })
}

function echoStyle(feature: FeatureLike): Style {
  const location = feature.get('location') as PointLocationBase
  const key = `${location.typeId}:${location.quality}`
  const cached = echoStyleCache.get(key)
  if (cached) {
    return cached
  }
  const verified = location.gameCoordinate !== null
  const style = new Style({
    image: location.iconUrl
      ? new Icon({
        src: location.iconUrl,
        crossOrigin: 'anonymous',
        scale: 0.14,
        opacity: verified ? 1 : 0.82,
      })
      : new CircleStyle({
        radius: 6,
        fill: new Fill({ color: verified ? '#65f1c2' : 'rgba(151, 169, 162, 0.48)' }),
      }),
  })
  echoStyleCache.set(key, style)
  return style
}

function navigationStyle(location: NavigationPoint): Style[] {
  const bossStyles = bossMarkerStyles.getStyle(location)
  if (bossStyles) {
    return bossStyles
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

function rebuildPointLayers(): void {
  echoSource.clear(true)
  navigationSource.clear(true)
  labelSource.clear(true)

  const echoFeatures = visibleEchoLocations.value.map(pointFeature)
  echoSource.addFeatures(echoFeatures)

  const navigationFeatures = visibleNavigationPoints.value.map(pointFeature)
  navigationSource.addFeatures(navigationFeatures)

  const labels = visibleRegionLabels.value.map((label) => {
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

function rebuildRoute(): void {
  routeSource.clear(true)
  routeViewport = null
  if (!route.value || route.value.points.length === 0) {
    return
  }
  const coordinates: [number, number][] = []
  if (route.value.startPointId) {
    const start = dataset.value?.navigationPoints.find(({ id }) => id === route.value?.startPointId)
    if (start) {
      coordinates.push([start.coordinate.mapX, start.coordinate.mapY])
    }
  }
  coordinates.push(...route.value.points.map(({ mapCoordinate }) => mapCoordinate))
  const line = new Feature({ geometry: new LineString(coordinates) })
  line.setStyle(new Style({
    stroke: new Stroke({ color: '#65f1c2', width: 3, lineDash: [9, 7] }),
  }))
  routeSource.addFeature(line)
  route.value.points.forEach((point, index) => {
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
  fitRouteViewport()
}

function fitRouteViewport(): void {
  const extent = routeSource.getExtent()
  const current = currentMapViewport()
  if (!map || !extent || isEmpty(extent) || !current) {
    return
  }
  // Refit around changing panels until the user deliberately moves the map.
  if (routeViewport && !matchesViewport(current, routeViewport)) {
    return
  }
  const [width = 0, height = 0] = map.getSize() ?? []
  map.getView().fit(extent, {
    padding: fitMapPadding(width, height, props.padding),
    minResolution: 0.5,
  })
  routeViewport = currentMapViewport()
  publishMapViewport()
}

function currentMapViewport(): MapViewportState | null {
  if (!map) {
    return null
  }
  const center = map.getView().getCenter()
  const zoom = map.getView().getZoom()
  const x = center?.[0]
  const y = center?.[1]
  if (x === undefined || y === undefined || zoom === undefined) {
    return null
  }
  return { center: [x, y], zoom }
}

function matchesViewport(viewport: MapViewportState, reference: MapViewportState | null): boolean {
  return reference !== null
    && Math.abs(viewport.center[0] - reference.center[0]) < 0.01
    && Math.abs(viewport.center[1] - reference.center[1]) < 0.01
    && Math.abs(viewport.zoom - reference.zoom) < 0.0001
}

function publishMapViewport(): void {
  const viewport = currentMapViewport()
  if (!viewport) {
    return
  }
  store.setMapViewport(matchesViewport(viewport, defaultViewport) ? null : viewport)
}

function updatePointerCoordinate(event: MapBrowserEvent): void {
  if (event.dragging) {
    return
  }
  const x = event.coordinate[0]
  const y = event.coordinate[1]
  if (x === undefined || y === undefined) {
    return
  }
  pointerCoordinate.value = [x, y]
}

function clearPointerCoordinate(): void {
  pointerCoordinate.value = null
}

function clearFloorLayers(): void {
  floorExtent = null
  if (!map) {
    return
  }
  floorLayers.forEach((layer) => map?.removeLayer(layer))
  floorLayers = []
}

function rebuildFloorLayers(): void {
  clearFloorLayers()
  const state = activeState.value
  const manifest = dataset.value?.source
  if (!map || !state || !manifest) {
    return
  }
  if (selectedLevelId.value === null) {
    if (mapViewport.value === null && baseViewport) {
      defaultViewport = baseViewport
      map.getView().setCenter([...baseViewport.center])
      map.getView().setZoom(baseViewport.zoom)
    }
    return
  }
  const floor = state.layeredMaps.flatMap(({ floors }) => floors).find(({ id }) => id === selectedLevelId.value)
  if (!floor) {
    return
  }
  const combinedExtent = createEmpty()
  floorLayers = floor.tiles.flatMap((tilePath) => {
    const imageExtent = layeredTileExtent(tilePath, manifest.tileWidth)
    if (!imageExtent) {
      return []
    }
    extend(combinedExtent, imageExtent)
    return [new ImageLayer({
      source: new ImageStatic({
        url: layeredTileUrl(manifest.mapResourceHash, state.id, tilePath),
        imageExtent,
        projection,
        crossOrigin: 'anonymous',
      }),
      opacity: 0.94,
      zIndex: 10,
    })]
  })
  floorLayers.forEach((layer) => map?.addLayer(layer))
  if (!isEmpty(combinedExtent)) {
    floorExtent = combinedExtent
    fitFloorViewport()
  }
}

function rebuildBaseLayer(): void {
  const state = activeState.value
  const manifest = dataset.value?.source
  if (!map || !state || !manifest) {
    return
  }
  if (baseLayer) {
    map.removeLayer(baseLayer)
  }
  baseLayer = createOfficialTileLayer(state, manifest)
  map.getLayers().insertAt(0, baseLayer)
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
  const defaultCenter = view.getCenter()
  const defaultX = defaultCenter?.[0]
  const defaultY = defaultCenter?.[1]
  const defaultZoom = view.getZoom()
  defaultViewport = defaultX !== undefined && defaultY !== undefined && defaultZoom !== undefined
    ? { center: [defaultX, defaultY], zoom: defaultZoom }
    : null
  baseViewport = defaultViewport
  if (mapViewport.value) {
    view.setCenter([...mapViewport.value.center])
    view.setZoom(mapViewport.value.zoom)
  }
  map.setView(view)
  rebuildFloorLayers()
  if (selectedLevelId.value === null || mapViewport.value !== null) {
    publishMapViewport()
  }
}

onMounted(() => {
  if (!mapTarget.value || !activeState.value) {
    return
  }
  map = new Map({
    target: mapTarget.value,
    controls: defaultControls({ rotate: false }),
    interactions: defaultInteractions({ pinchRotate: false, altShiftDragRotate: false }),
    layers: [labelLayer, echoLayer, navigationLayer, routeLayer],
    view: new View({ projection, enableRotation: false, center: [0, 0], resolution: 4 }),
  })
  map.on('moveend', publishMapViewport)
  map.on('pointermove', updatePointerCoordinate)
  map.on('singleclick', updatePointerCoordinate)
  rebuildBaseLayer()
  rebuildPointLayers()
  rebuildRoute()
})

watch(activeState, rebuildBaseLayer)
watch(selectedLevelId, rebuildFloorLayers)
watch([visibleEchoLocations, visibleNavigationPoints, visibleRegionLabels], rebuildPointLayers)
watch(route, rebuildRoute, { flush: 'post' })
watch(() => props.padding, () => {
  fitFloorViewport()
  fitRouteViewport()
}, { flush: 'post' })

onBeforeUnmount(() => {
  bossMarkerStyles.dispose()
  map?.un('moveend', publishMapViewport)
  map?.un('pointermove', updatePointerCoordinate)
  map?.un('singleclick', updatePointerCoordinate)
  map?.setTarget(undefined)
  map = null
})
</script>

<template>
  <div class="relative h-full w-full min-h-0 min-w-0">
    <div
      ref="mapTargetRef"
      class="absolute inset-0 [background:linear-gradient(rgba(101,241,194,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(101,241,194,0.025)_1px,transparent_1px),#0c1715] [background-size:32px_32px]"
      aria-label="鸣潮声骸地图"
      @mouseleave="clearPointerCoordinate"
    />
    <div
      v-if="pointerCoordinateText"
      aria-hidden="true"
      class="pointer-events-none absolute bottom-[calc(var(--mobile-bar-height)+12px)] left-[max(12px,env(safe-area-inset-left))] z-70 select-none rounded-6px border border-[var(--line)] bg-[#07110fe6] px-9px py-6px font-mono text-12px text-[var(--muted)] tabular-nums shadow-lg min-[1024px]:bottom-16px"
    >
      {{ pointerCoordinateText }}
    </div>
  </div>
</template>
