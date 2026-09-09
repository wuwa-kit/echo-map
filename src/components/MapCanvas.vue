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
import { createPointLayers, mapFeaturesPointIds } from '../map/point-layers.ts'
import { createFloorLayers } from '../map/floor-layers.ts'
import { createRouteLayer } from '../map/route-layer.ts'
import { useMapViewport } from '../map/useMapViewport.ts'
import { floorExtent } from '../map/floor-coverage.ts'
import type { MapPadding } from '../map/viewport-padding.ts'
import PointDetails from './PointDetails.vue'
import FloorSwitcher from './FloorSwitcher.vue'
import MapCoordinateDisplay from './MapCoordinateDisplay.vue'

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
  nearbyFloorGroups,
  floorSwitcherVisible,
  compactFloors,
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
const lastGameCoordinate = shallowRef<[number, number]>([0, 0])
const pointerCoordinateText = computed(() => {
  const [x, y] = lastGameCoordinate.value
  return `${x} · ${y}`
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
  updateFloorViewport()
})

function updateFloorViewport(): void {
  const [width = 0, height = 0] = map?.getSize() ?? []
  if (!map || width <= 0 || height <= 0) {
    store.setFloorViewport(null)
    return
  }
  const view = map.getView()
  store.setFloorViewport(view.calculateExtent([width, height]), view.getResolution() ?? Number.NaN)
}

function onMoveEnd(): void {
  const view = map?.getView()
  const resolution = view?.getResolution()
  if (view && resolution !== undefined) points.finishInteraction(view.calculateExtent(map?.getSize()), resolution, projection)
  viewport.publish()
  updateFloorViewport()
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
  updateLastCoordinate(map.getView().getCenter())
  rebuildFloorLayers()
  viewport.publish()
  updateFloorViewport()
}

function switchGravity(): void {
  if (map && activeState.value && dataset.value) baseLayers.update(map, activeState.value, dataset.value.source, selectedGravity.value)
}

function updateLastCoordinate(coordinate: number[] | undefined): void {
  const mapX = coordinate?.[0]
  const mapY = coordinate?.[1]
  const tileWidth = dataset.value?.source.tileWidth
  if (mapX === undefined || mapY === undefined || tileWidth === undefined) return
  const [x, y] = mapToGameCoordinate(mapX, mapY, tileWidth)
  lastGameCoordinate.value = [Math.round(x), Math.round(y)]
}

function updatePointerCoordinate(event: MapBrowserEvent): void {
  if (!event.dragging) updateLastCoordinate(event.coordinate)
}

function applyMapNavigation(): void {
  const request = mapNavigationRequest.value
  if (!request || !map) return
  const region = dataset.value?.regionLabels.find(({ id }) => id === request.regionId)
  if (region) viewport.locate([region.coordinate.mapX, region.coordinate.mapY])
  store.completeMapNavigation()
}

function selectMapPoint(event: MapBrowserEvent): void {
  updatePointerCoordinate(event)
  const found = map ? mapFeaturesPointIds(map.getFeaturesAtPixel(event.pixel, { hitTolerance: 6 })) : []
  if (found.length > 1) store.selectPointCandidates(found)
  else store.selectPoint(found[0] ?? null)
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
    />
    <div :style="floorDockStyle" class="pointer-events-none absolute bottom-[var(--floor-dock-bottom)] right-[var(--floor-dock-right)] z-70 max-h-[var(--floor-dock-height)] flex flex-col items-start gap-4px" :class="shortFloorDock ? 'left-[max(60px,env(safe-area-inset-left))]' : 'left-[max(8px,env(safe-area-inset-left))]'">
      <FloorSwitcher
        :selected-level-id="selectedLevelId" :floor-request="floorRequest" :floor-groups="nearbyFloorGroups"
        :visible="floorSwitcherVisible" :compact-floors="compactFloors"
        @level-requested="store.requestLevel" @layout-toggled="store.toggleFloorLayout"
      />
      <MapCoordinateDisplay :text="pointerCoordinateText" />
    </div>
  </div>
</template>
