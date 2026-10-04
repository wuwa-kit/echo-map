<script setup lang="ts">
import WuButton from './base/WuButton.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useResizeObserver } from '@vueuse/core'
import Map from 'ol/Map.js'
import Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { authoredPointMapDisplay, editorLibraryLocations } from '../domain/point-library.ts'
import { matchesGravity } from '../domain/gravity.ts'
import { isOfficialPointReplaced } from '../domain/point-matching.ts'
import { createEditorArrivalStyle, createEditorSelectionStyle } from '../map/editor-marker.ts'
import View from 'ol/View.js'
import type MapBrowserEvent from 'ol/MapBrowserEvent.js'
import { defaults as defaultControls } from 'ol/control/defaults.js'
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js'
import Projection from 'ol/proj/Projection.js'
import { useExplorerStore } from '../stores/explorer.ts'
import { gameToMapCoordinate, mapToGameCoordinate } from '../map/projection.ts'
import { createOfficialBaseLayers } from '../map/official-base-layers.ts'
import { createPointLayers, mapFeaturesPointIds } from '../map/point-layers.ts'
import { createFloorLayers } from '../map/floor-layers.ts'
import { createRouteLayer } from '../map/route-layer.ts'
import type { RouteLegDetails } from '../map/route-layer.ts'
import { useMapViewport } from '../map/useMapViewport.ts'
import { floorExtent } from '../map/floor-coverage.ts'
import type { MapPadding } from '../map/viewport-padding.ts'
import PointDetails from './PointDetails.vue'
import RouteLegDetailsPopup from './RouteLegDetails.vue'
import FloorSwitcher from './FloorSwitcher.vue'
import WuPopover from './base/WuPopover.vue'
import type { AuthoredPoint } from '../domain/types.ts'
import MapCoordinateDisplay from './MapCoordinateDisplay.vue'

const props = defineProps<{
  editing?: boolean
  padding: MapPadding
  dockBottom: number
}>()

const emit = defineEmits<{ editorPointsSelected: [ids: string[]], pointAddRequested: [request: { kind: AuthoredPoint['kind'], coordinate: [number, number] }] }>()
const editor = usePointEditorStore()
const store = useExplorerStore()
const selectionSource = new VectorSource()
const selectionLayer = new VectorLayer({ source: selectionSource, zIndex: 50 })
const selectionStyle = createEditorSelectionStyle()
const arrivalStyle = createEditorArrivalStyle()
function isDraftInView(coordinate: [number, number]): boolean {
  const draft = editor.draft
  return Boolean(draft && dataset.value && draft.stateId === store.selectedStateId
    && viewport.containsCoordinate(gameToMapCoordinate(coordinate[0], coordinate[1], dataset.value.source.tileWidth)))
}
function locateDraft(coordinate?: [number, number]): boolean {
  const draft = editor.draft
  if (!draft || !dataset.value || draft.stateId !== store.selectedStateId) return false
  if (coordinate) {
    return viewport.locate(gameToMapCoordinate(coordinate[0], coordinate[1], dataset.value.source.tileWidth))
  }
  const display = authoredPointMapDisplay(draft, dataset.value)
  return display ? viewport.locate([display.location.coordinate.mapX, display.location.coordinate.mapY]) : false
}
defineExpose({ locateDraft, isDraftInView })
const {
  activeState,
  dataset,
  activeEchoIds,
  mapViewport,
  mapNavigationRequest,
  mapRoutes,
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
const contextAnchor = useTemplateRef<HTMLElement>('contextAnchorRef')
const contextMenu = useTemplateRef<InstanceType<typeof WuPopover>>('contextMenuRef')
const contextPosition = shallowRef({ x: 0, y: 0 })
const contextCoordinate = shallowRef<[number, number]>([0, 0])
async function openContextMenu(event: MouseEvent): Promise<void> {
  if (!props.editing || !map) return
  event.preventDefault()
  if (editor.busy) return
  contextMenu.value?.hide()
  updateLastCoordinate(map.getEventCoordinate(event))
  contextCoordinate.value = [...lastGameCoordinate.value]
  contextPosition.value = { x: event.clientX, y: event.clientY }
  await nextTick()
  if (props.editing) contextMenu.value?.show()
}
function requestPoint(kind: AuthoredPoint['kind']): void {
  if (!props.editing || editor.busy) return
  contextMenu.value?.hide()
  emit('pointAddRequested', { kind, coordinate: contextCoordinate.value })
}
function closeContextMenu(): void { contextMenu.value?.hide() }
const mapSize = shallowRef<[number, number]>([0, 0])
const shortFloorDock = computed(() => mapSize.value[1] - props.dockBottom < 320)
const floorDockHeight = computed(() => Math.max(86, mapSize.value[1] - props.dockBottom - (shortFloorDock.value ? 16 : 112)))
const floorDockStyle = computed(() => ({
  '--floor-dock-bottom': `${props.dockBottom}px`,
  '--floor-dock-height': `${floorDockHeight.value}px`,
  '--floor-dock-right': `${props.padding[1]}px`,
}))
const lastGameCoordinate = shallowRef<[number, number]>([0, 0])
const selectedRouteLeg = shallowRef<RouteLegDetails | null>(null)
const pointerCoordinateText = computed(() => {
  const [x, y] = lastGameCoordinate.value
  return `${x} · ${y}`
})
let map: Map | null = null
const baseLayers = createOfficialBaseLayers(store.reportBaseTileError)
const projection = new Projection({ code: 'KURO:CRS-SIMPLE', units: 'pixels' })
function isMapMoving(): boolean {
  const view = map?.getView()
  return Boolean(view?.getAnimating() || view?.getInteracting())
}
const points = createPointLayers(isMapMoving)
const editorPoints = createPointLayers(isMapMoving, { onStyleChange: () => selectionLayer.changed() })
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
  if (view && resolution !== undefined) {
    const atMaximumZoom = resolution <= view.getMinResolution() * 1.000001
    editorPoints.finishInteraction(view.calculateExtent(map?.getSize()), resolution, projection, atMaximumZoom)
    points.finishInteraction(view.calculateExtent(map?.getSize()), resolution, projection, atMaximumZoom)
  }
  viewport.publish()
  updateFloorViewport()
  if (map) floors.updateViewport(map.getView().calculateExtent(map.getSize()))
}

function rebuildPointLayers(): void {
  for (const layer of points.layers) layer.setVisible(!props.editing)
  for (const layer of editorPoints.layers) layer.setVisible(Boolean(props.editing))
  if (props.editing && dataset.value) {
    const draft = editor.draft
    const replaced = new Set(draft ? [draft.id, ...(draft.officialIds ?? []), ...(draft.replacesOfficialIds ?? [])] : [])
    const locations = editorLibraryLocations(editor.allPoints.filter((point) => !isOfficialPointReplaced(point, replaced)), dataset.value, editor.editorMode)
    const matches = (point: { stateId: number, gravityType?: 1 | 2 | null, levelId: string | null }) => point.stateId === store.selectedStateId && matchesGravity(point.gravityType ?? null, store.supportsGravity ? selectedGravity.value : null)
      && (selectedLevelId.value === null || point.levelId === null || point.levelId === selectedLevelId.value)
    editorPoints.update(locations.echoLocations.filter(matches), locations.navigationPoints.filter(matches), visibleRegionLabels.value, dataset.value.echoes, undefined, selectedLevelId.value)
    rebuildDraft()
    return
  }
  selectionSource.clear(true)
  points.update(mapEchoLocations.value, mapNavigationPoints.value, visibleRegionLabels.value, dataset.value?.echoes ?? [], activeEchoIds.value, selectedLevelId.value)
}

function rebuildDraft(): void {
  selectionSource.clear(true)
  const draft = editor.draft
  if (!props.editing || !draft || !dataset.value || draft.stateId !== store.selectedStateId) return
  const display = authoredPointMapDisplay(draft, dataset.value)
  if (!display) return
  const styles = editorPoints.styleFor(display)
  const feature = new Feature({ geometry: new Point([display.location.coordinate.mapX, display.location.coordinate.mapY]), mapPoint: display })
  feature.setStyle([selectionStyle, ...(Array.isArray(styles) ? styles : styles ? [styles] : [])])
  selectionSource.addFeature(feature)
  const arrival = draft.kind === 'navigation' ? draft.teleportCoordinate : undefined
  if (arrival && arrival.x !== null && arrival.y !== null) {
    const feature = new Feature({ geometry: new Point(gameToMapCoordinate(arrival.x, arrival.y, dataset.value.source.tileWidth)) })
    feature.setStyle(arrivalStyle)
    selectionSource.addFeature(feature)
  }
}

function rebuildRoute(): void {
  routeLayer.update(props.editing ? [] : mapRoutes.value)
  selectedRouteLeg.value = null
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
  if (region) viewport.locate([region.coordinate.mapX, region.coordinate.mapY], 2.3)
  store.completeMapNavigation()
}

function selectMapPoint(event: MapBrowserEvent): void {
  updatePointerCoordinate(event)
  const found = map ? mapFeaturesPointIds(map.getFeaturesAtPixel(event.pixel, { hitTolerance: 6 })) : []
  if (props.editing) {
    if (found.length) emit('editorPointsSelected', found)
    return
  }
  if (found.length > 0) {
    selectedRouteLeg.value = null
    if (found.length > 1) store.selectPointCandidates(found)
    else store.selectPoint(found[0] ?? null)
    return
  }
  const resolution = map?.getView().getResolution()
  selectedRouteLeg.value = resolution === undefined ? null : routeLayer.hitTest(event.coordinate, resolution)
  store.selectPoint(null)
}

onMounted(() => {
  if (!mapTarget.value || !activeState.value) {
    return
  }
  map = new Map({
    target: mapTarget.value,
    controls: defaultControls({ rotate: false, zoom: false, attribution: false }),
    interactions: defaultInteractions({ pinchRotate: false, altShiftDragRotate: false }),
    layers: [...points.layers, ...editorPoints.layers, routeLayer.layer, selectionLayer],
    view: new View({ projection, enableRotation: false, center: [0, 0], resolution: 4 }),
  })
  map.on('movestart', closeContextMenu)
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
watch([() => props.editing, () => editor.editorMode, () => editor.allPoints, () => editor.draft, activeState, selectedGravity], rebuildPointLayers)
watch([() => props.editing, mapRoutes], rebuildRoute, { flush: 'post' })
watch(mapNavigationRequest, applyMapNavigation, { flush: 'post' })

onBeforeUnmount(() => {
  map?.un('movestart', closeContextMenu)
  map?.un('moveend', onMoveEnd)
  map?.un('pointermove', updatePointerCoordinate)
  map?.un('singleclick', selectMapPoint)
  map?.setTarget(undefined)
  floors.dispose()
  points.dispose()
  editorPoints.dispose()
  selectionSource.clear(true)
  routeLayer.dispose()
  baseLayers.dispose()
  map?.dispose()
  map = null
})
</script>

<template>
  <div class="relative h-full w-full min-h-0 min-w-0">
    <span ref="contextAnchorRef" class="pointer-events-none fixed h-0 w-0" :style="{ left: `${contextPosition.x}px`, top: `${contextPosition.y}px` }" />
    <WuPopover ref="contextMenuRef" :anchor="contextAnchor" :disabled="!editing || editor.busy" :width="144" :gap="0" class="rounded-[8px] border border-[var(--line)] bg-[#102019] text-[#c7dfd2] shadow-xl">
      <WuButton variant="ghost" @click="requestPoint('navigation')">添加定位</WuButton>
      <WuButton variant="ghost" @click="requestPoint('echo')">添加声骸</WuButton>
    </WuPopover>
    <PointDetails v-if="!editing" />
    <RouteLegDetailsPopup v-if="!editing && selectedRouteLeg" :details="selectedRouteLeg" @close="selectedRouteLeg = null" />
    <div v-if="baseTileError" class="absolute left-1/2 top-[12px] z-70 flex max-w-[90%] -translate-x-1/2 items-center gap-[10px] rounded-[8px] bg-[#35261eed] px-[12px] py-[8px] text-[12px] text-[#f1d7b4]">
      <span>{{ selectedGravity === 2 ? '反重力' : '' }}底图部分加载失败</span>
      <WuButton size="sm" @click="store.retryBaseTiles">重试</WuButton>
    </div>
    <div
      ref="mapTargetRef"
      @contextmenu="openContextMenu"
      class="absolute inset-0 [background:linear-gradient(rgba(101,241,194,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(101,241,194,0.025)_1px,transparent_1px),#0c1715] [background-size:32px_32px]"
    />
    <div :style="floorDockStyle" class="pointer-events-none absolute bottom-[var(--floor-dock-bottom)] right-[var(--floor-dock-right)] z-70 max-h-[var(--floor-dock-height)] flex flex-col items-start gap-[4px]" :class="shortFloorDock ? 'left-[max(60px,env(safe-area-inset-left))]' : 'left-[max(8px,env(safe-area-inset-left))]'">
      <FloorSwitcher
        :selected-level-id="selectedLevelId" :floor-request="floorRequest" :floor-groups="nearbyFloorGroups"
        :visible="floorSwitcherVisible" :compact-floors="compactFloors"
        @level-requested="store.requestLevel" @layout-toggled="store.toggleFloorLayout"
      />
      <MapCoordinateDisplay :text="pointerCoordinateText" />
    </div>
  </div>
</template>
