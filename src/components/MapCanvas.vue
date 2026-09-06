<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useResizeObserver } from '@vueuse/core'
import Map from 'ol/Map.js'
import View from 'ol/View.js'
import type MapBrowserEvent from 'ol/MapBrowserEvent.js'
import { defaults as defaultControls } from 'ol/control/defaults.js'
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js'
import Projection from 'ol/proj/Projection.js'
import { useExplorerStore } from '../stores/explorer.ts'
import { mapToGameCoordinate } from '../map/projection.ts'
import { createOfficialBaseLayers } from '../map/official-base-layers.ts'
import { createPointLayers, mapFeaturePointIds } from '../map/point-layers.ts'
import { createFloorLayers } from '../map/floor-layers.ts'
import { createRouteLayer } from '../map/route-layer.ts'
import { useMapViewport } from '../map/useMapViewport.ts'
import type { MapPadding } from '../map/viewport-padding.ts'
import PointDetails from './PointDetails.vue'

const props = defineProps<{ padding: MapPadding }>()

const store = useExplorerStore()
const {
  activeState,
  dataset,
  activeEchoIds,
  allNavigationPoints,
  mapViewport,
  mapNavigationRequest,
  route,
  selectedLevelId,
  selectedGravity,
  baseTileError,
  baseTileRetry,
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
let map: Map | null = null
const baseLayers = createOfficialBaseLayers(store.reportBaseTileError)
const projection = new Projection({ code: 'KURO:CRS-SIMPLE', units: 'pixels' })
const points = createPointLayers()
const floors = createFloorLayers(projection)
const routeLayer = createRouteLayer()
const viewport = useMapViewport({
  getMap: () => map,
  getPadding: () => props.padding,
  getSavedViewport: () => mapViewport.value,
  onViewportChanged: store.setMapViewport,
})

function fitViewport(): void {
  viewport.fitFloor(floors.getExtent())
  viewport.fitRoute(routeLayer.getExtent())
}

useResizeObserver(mapTarget, () => {
  map?.updateSize()
  fitViewport()
})

function rebuildPointLayers(): void {
  points.update(visibleEchoLocations.value, visibleNavigationPoints.value, visibleRegionLabels.value, dataset.value?.echoes ?? [], activeEchoIds.value)
}

function rebuildRoute(): void {
  const start = allNavigationPoints.value.find(({ id }) => id === route.value?.startPointId)
  routeLayer.update(route.value, start)
  viewport.resetRoute()
  viewport.fitRoute(routeLayer.getExtent())
}

function rebuildFloorLayers(): void {
  const state = activeState.value
  const manifest = dataset.value?.source
  if (!map || !state || !manifest) {
    floors.clear()
    return
  }
  floors.update(map, state, manifest, selectedLevelId.value)
  if (selectedLevelId.value === null) {
    viewport.restoreBaseViewport()
    return
  }
  viewport.fitFloor(floors.getExtent())
}

function rebuildBaseLayer(): void {
  const state = activeState.value
  const manifest = dataset.value?.source
  if (!map || !state || !manifest) {
    return
  }
  baseLayers.update(map, state, manifest, selectedGravity.value)
  viewport.configureBaseView(state, projection)
  rebuildFloorLayers()
  if (selectedLevelId.value === null || mapViewport.value !== null) {
    viewport.publish()
  }
}

function switchGravity(): void {
  if (map && activeState.value && dataset.value) baseLayers.update(map, activeState.value, dataset.value.source, selectedGravity.value)
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

function applyMapNavigation(): void {
  const request = mapNavigationRequest.value
  if (!request || !map) return
  const region = dataset.value?.regionLabels.find(({ id }) => id === request.regionId)
  if (region) viewport.locate([region.coordinate.mapX, region.coordinate.mapY])
  store.completeMapNavigation()
}

function clearPointerCoordinate(): void {
  pointerCoordinate.value = null
}

function selectMapPoint(event: MapBrowserEvent): void {
  updatePointerCoordinate(event)
  const found = map?.forEachFeatureAtPixel(event.pixel, mapFeaturePointIds, { hitTolerance: 6 })
  if (found && found.length > 1) store.selectPointCandidates(found)
  else store.selectPoint(found?.[0] ?? null)
}

onMounted(() => {
  if (!mapTarget.value || !activeState.value) {
    return
  }
  map = new Map({
    target: mapTarget.value,
    controls: defaultControls({ rotate: false }),
    interactions: defaultInteractions({ pinchRotate: false, altShiftDragRotate: false }),
    layers: [...points.layers, routeLayer.layer],
    view: new View({ projection, enableRotation: false, center: [0, 0], resolution: 4 }),
  })
  map.on('moveend', viewport.publish)
  map.on('pointermove', updatePointerCoordinate)
  map.on('singleclick', selectMapPoint)
  rebuildBaseLayer()
  rebuildPointLayers()
  rebuildRoute()
  applyMapNavigation()
})

watch(activeState, rebuildBaseLayer)
watch(selectedGravity, switchGravity)
watch(baseTileRetry, () => baseLayers.retry())
watch(selectedLevelId, rebuildFloorLayers)
watch([visibleEchoLocations, visibleNavigationPoints, visibleRegionLabels, activeEchoIds], rebuildPointLayers)
watch(route, rebuildRoute, { flush: 'post' })
watch(() => props.padding, fitViewport, { flush: 'post' })
watch(mapNavigationRequest, applyMapNavigation, { flush: 'post' })

onBeforeUnmount(() => {
  map?.un('moveend', viewport.publish)
  map?.un('pointermove', updatePointerCoordinate)
  map?.un('singleclick', selectMapPoint)
  map?.setTarget(undefined)
  floors.dispose()
  points.dispose()
  routeLayer.dispose()
  baseLayers.dispose()
  map?.dispose()
  map = null
})
</script>

<template>
  <div class="relative h-full w-full min-h-0 min-w-0">
    <PointDetails />
    <div v-if="baseTileError" role="alert" class="absolute left-1/2 top-12px z-70 flex max-w-[90%] translate-x--1/2 items-center gap-10px rounded-8px bg-[#35261eed] px-12px py-8px text-12px text-[#f1d7b4]">
      <span>{{ selectedGravity === 2 ? '反重力' : '' }}底图部分加载失败</span>
      <button type="button" class="min-h-32px shrink-0 rounded-5px border border-[#a27f58] bg-transparent px-8px text-inherit" @click="store.retryBaseTiles">重试</button>
    </div>
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
