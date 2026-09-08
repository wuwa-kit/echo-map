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
import { floorExtent } from '../map/floor-coverage.ts'
import { fitMapPadding } from '../map/viewport-padding.ts'
import type { MapPadding } from '../map/viewport-padding.ts'
import PointDetails from './PointDetails.vue'
import FloorSwitcher from './FloorSwitcher.vue'

const props = defineProps<{
  padding: MapPadding
  dockBottom: number
}>()

const store = useExplorerStore()
const {
  activeState,
  dataset,
  activeEchoIds,
  mapViewport,
  mapNavigationRequest,
  route,
  selectedLevelId,
  floorRequest,
  selectedGravity,
  baseTileError,
  baseTileRetry,
  mapEchoLocations,
  mapNavigationPoints,
  visibleRegionLabels,
} = storeToRefs(store)
const mapTarget = useTemplateRef<HTMLElement>('mapTargetRef')
const mapSize = shallowRef<[number, number]>([0, 0])
const shortFloorDock = computed(() => mapSize.value[1] - props.dockBottom < 320)
const floorDockHeight = computed(() => Math.max(86, mapSize.value[1] - props.dockBottom - (shortFloorDock.value ? 16 : 112)))
const floorDockStyle = computed(() => ({
  '--floor-dock-bottom': `${props.dockBottom}px`,
  '--floor-dock-height': `${floorDockHeight.value}px`,
  '--floor-dock-right': `${props.padding[1]}px`,
}))
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
const points = createPointLayers(() => {
  const view = map?.getView()
  return Boolean(view?.getAnimating() || view?.getInteracting())
})
const floors = createFloorLayers(projection, { dimBase: true, onError: store.reportFloorTileError })
const routeLayer = createRouteLayer(points.layers)
const viewport = useMapViewport({
  getMap: () => map,
  getPadding: () => props.padding,
  getSavedViewport: () => mapViewport.value,
  onViewportChanged: store.setMapViewport,
})

useResizeObserver(mapTarget, () => {
  map?.updateSize()
  const [width = 0, height = 0] = map?.getSize() ?? []
  mapSize.value = [width, height]
  updateFloorCenter()
})

function updateFloorCenter(): void {
  const [width = 0, height = 0] = map?.getSize() ?? []
  if (!map || width <= 0 || height <= 0) return
  const [top, right, bottom, left] = fitMapPadding(width, height, props.padding)
  const coordinate = map.getCoordinateFromPixel([(left + width - right) / 2, (top + height - bottom) / 2])
  const [x, y] = coordinate ?? []
  store.setFloorCenter(x === undefined || y === undefined ? null : [x, y], map.getView().getResolution() ?? 1)
}

function onMoveEnd(): void {
  const view = map?.getView()
  const resolution = view?.getResolution()
  if (view && resolution !== undefined) points.finishInteraction(view.calculateExtent(map?.getSize()), resolution, projection)
  viewport.publish()
  updateFloorCenter()
  if (map) floors.updateViewport(map.getView().calculateExtent(map.getSize()))
}

function rebuildPointLayers(): void {
  points.update(mapEchoLocations.value, mapNavigationPoints.value, visibleRegionLabels.value, dataset.value?.echoes ?? [], activeEchoIds.value, selectedLevelId.value)
}

function rebuildRoute(): void {
  routeLayer.update(route.value)
}

function rebuildFloorLayers(): void {
  const state = activeState.value
  const manifest = dataset.value?.source
  if (!map || !state || !manifest) {
    floors.clear()
    return
  }
  floors.update(map, state, manifest, selectedLevelId.value)
  floors.updateViewport(map.getView().calculateExtent(map.getSize()))
}

function rebuildBaseLayer(): void {
  const state = activeState.value
  const manifest = dataset.value?.source
  if (!map || !state || !manifest) {
    return
  }
  baseLayers.update(map, state, manifest, selectedGravity.value)
  viewport.configureBaseView(state, projection)
  const selected = state.layeredMaps.flatMap(({ floors }) => floors).find(({ id }) => id === selectedLevelId.value)
  if (selected) viewport.restoreFloorViewport(floorExtent(selected, manifest.tileWidth))
  rebuildFloorLayers()
  viewport.publish()
  updateFloorCenter()
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
    controls: defaultControls({ rotate: false, zoom: false }),
    interactions: defaultInteractions({ pinchRotate: false, altShiftDragRotate: false }),
    layers: [...points.layers, routeLayer.layer],
    view: new View({ projection, enableRotation: false, center: [0, 0], resolution: 4 }),
  })
  map.on('moveend', onMoveEnd)
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
watch(floorRequest, async (request, _previous, onCleanup) => {
  if (request?.status !== 'loading') { floors.cancelPreparation(); return }
  const currentMap = map
  const state = activeState.value
  const manifest = dataset.value?.source
  if (!currentMap || !state || !manifest) return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    const preparation = floors.prepare(state, manifest, request.levelId, () => currentMap.getView().calculateExtent(currentMap.getSize()), controller.signal)
    if (preparation) await preparation
    if (controller.signal.aborted || !store.completeFloorRequest(request.token)) return
    // The prepared images, point scope and mask become visible in the same render turn.
    floors.update(currentMap, state, manifest, request.levelId)
    floors.updateViewport(currentMap.getView().calculateExtent(currentMap.getSize()))
  } catch {
    if (!controller.signal.aborted) store.failFloorRequest(request.token)
  }
})
watch([mapEchoLocations, mapNavigationPoints, visibleRegionLabels, activeEchoIds, selectedLevelId], rebuildPointLayers)
watch(route, rebuildRoute, { flush: 'post' })
watch(() => props.padding, updateFloorCenter, { flush: 'post' })
watch(mapNavigationRequest, applyMapNavigation, { flush: 'post' })

onBeforeUnmount(() => {
  map?.un('moveend', onMoveEnd)
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
    <div v-if="baseTileError" class="absolute left-1/2 top-12px z-70 flex max-w-[90%] translate-x--1/2 items-center gap-10px rounded-8px bg-[#35261eed] px-12px py-8px text-12px text-[#f1d7b4]">
      <span>{{ selectedGravity === 2 ? '反重力' : '' }}底图部分加载失败</span>
      <button type="button" class="min-h-32px shrink-0 rounded-5px border border-[#a27f58] bg-transparent px-8px text-inherit" @click="store.retryBaseTiles">重试</button>
    </div>
    <div
      ref="mapTargetRef"
      class="absolute inset-0 [background:linear-gradient(rgba(101,241,194,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(101,241,194,0.025)_1px,transparent_1px),#0c1715] [background-size:32px_32px]"
      @mouseleave="clearPointerCoordinate"
    />
    <div :style="floorDockStyle" class="pointer-events-none absolute bottom-[var(--floor-dock-bottom)] right-[var(--floor-dock-right)] z-70 max-h-[var(--floor-dock-height)] flex flex-col items-start gap-8px" :class="shortFloorDock ? 'left-[max(68px,env(safe-area-inset-left))]' : 'left-[max(8px,env(safe-area-inset-left))]'">
      <FloorSwitcher />
      <div class="h-32px max-w-full shrink-0 select-none overflow-hidden whitespace-nowrap rounded-6px border border-[var(--line)] bg-[#07110fe6] px-9px py-6px font-mono text-12px text-[var(--muted)] tabular-nums shadow-lg" :class="{ invisible: !pointerCoordinateText }">
        {{ pointerCoordinateText }}
      </div>
    </div>
  </div>
</template>
