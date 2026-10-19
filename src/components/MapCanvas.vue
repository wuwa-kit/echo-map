<script setup lang="ts">
import WuButton from './base/WuButton.vue'
import { coordinateInputPreviewXY, coordinateInputXY } from './base/coordinate-input.ts'
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
import { createMarkerZoomStyles } from '../map/marker-zoom.ts'
import { createEditorGridLayer } from '../map/editor-grid.ts'
import View from 'ol/View.js'
import type MapBrowserEvent from 'ol/MapBrowserEvent.js'
import { defaults as defaultControls } from 'ol/control/defaults.js'
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js'
import Projection from 'ol/proj/Projection.js'
import { useExplorerStore } from '../stores/explorer.ts'
import { gameToMapCoordinate, mapToGameCoordinate } from '../map/projection.ts'
import { createOfficialBaseLayers } from '../map/official-base-layers.ts'
import { createPointLayers, mapFeaturePointIds, mapFeaturesPointIds } from '../map/point-layers.ts'
import { mapResolutionForScale } from '../map/map-scale.ts'
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
const selectionLayer = new VectorLayer({ source: selectionSource, zIndex: 50, updateWhileAnimating: true, updateWhileInteracting: true })
const zoomSelectionStyles = createMarkerZoomStyles()
const arrivalStyle = createEditorArrivalStyle()
const editorGrid = createEditorGridLayer()
watch(() => Boolean(props.editing && editor.editorMode === 'echo'), (visible) => editorGrid.setVisible(visible), { immediate: true })
const draftInView = shallowRef(false)
const arrivalInView = shallowRef(false)
function updateDraftInView(): void {
  const coordinate = editor.draft && coordinateInputXY(editor.positionInput, editor.draft.coordinate)
  draftInView.value = Boolean(coordinate && isDraftInView(coordinate))
  const draft = editor.draft
  const arrival = draft?.kind === 'navigation' && draft.mode === 'fast-travel'
    ? coordinateInputXY(editor.arrivalInput, draft.teleportCoordinate ?? { x: null, y: null, z: null }) : null
  arrivalInView.value = Boolean(arrival && isDraftInView(arrival))
}
function isDraftInView(coordinate: [number, number]): boolean {
  const draft = editor.draft
  return Boolean(draft && dataset.value && draft.stateId === store.selectedStateId
    && viewport.containsCoordinate(gameToMapCoordinate(coordinate[0], coordinate[1])))
}
function locateDraft(coordinate?: [number, number]): boolean {
  const draft = editor.draft
  if (!draft || !dataset.value || draft.stateId !== store.selectedStateId) return false
  if (coordinate) {
    return viewport.locate(gameToMapCoordinate(coordinate[0], coordinate[1]))
  }
  const display = authoredPointMapDisplay(draft, dataset.value)
  return display ? viewport.locate([display.location.coordinate.mapX, display.location.coordinate.mapY]) : false
}
function locateManagedPoint(point: AuthoredPoint): boolean {
  if (!dataset.value || point.stateId !== store.selectedStateId) return false
  const display = authoredPointMapDisplay(point, dataset.value)
  return display ? viewport.locate([display.location.coordinate.mapX, display.location.coordinate.mapY], Math.min(map?.getView().getResolution() ?? 1, 1)) : false
}
defineExpose({ locateDraft, isDraftInView, draftInView, arrivalInView, locateManagedPoint })
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
  canvasScale,
  selectedGravity,
  baseTileError,
  baseTileRetry,
  mapEchoLocations,
  mapNavigationPoints,
  visibleRegionLabels,
} = storeToRefs(store)
const mapFrame = useTemplateRef<HTMLElement>('mapFrameRef')
const canvasRatio = computed(() => canvasScale.value / 100)
// Enlarge the logical viewport before scaling it down; leave all UI siblings unscaled.
const canvasStyle = computed(() => ({
  width: `${100 / canvasRatio.value}%`,
  height: `${100 / canvasRatio.value}%`,
  transform: `scale(${canvasRatio.value})`,
}))
const mapTarget = useTemplateRef<HTMLElement>('mapTargetRef')
const contextAnchor = useTemplateRef<HTMLElement>('contextAnchorRef')
const contextMenu = useTemplateRef<InstanceType<typeof WuPopover>>('contextMenuRef')
const pointAnchor = useTemplateRef<HTMLElement>('pointAnchorRef')
const pointPopover = useTemplateRef<InstanceType<typeof WuPopover>>('pointPopoverRef')
let pointClickCoordinate: number[] | null = null
let pointPopupView: { center: number[], resolution: number | undefined } | null = null
const pointPopupVisible = computed(() => Boolean(!props.editing && (
  store.selectedEchoLocation || store.selectedNavigationPoint
  || store.pointCandidates.length || store.navigationPointCandidates.length
)))

function closePointPopup(): void {
  pointPopover.value?.hide()
  store.selectPoint(null)
  pointClickCoordinate = null
  pointPopupView = null
}

function onPointPopupRender(): void {
  if (!pointPopupVisible.value || !map) return
  const selected = store.selectedEchoLocation ?? store.selectedNavigationPoint
  const ids = new Set(selected ? [selected.id] : [
    ...store.pointCandidates.map(point => point.id),
    ...store.navigationPointCandidates.map(point => point.id),
  ])
  // Hit-test rendered feature centers, including cluster centers and floor masks.
  const visible = points.layers.some(layer => layer.getSource()?.getFeatures().some(feature => {
    if (!mapFeaturePointIds(feature)?.some(id => ids.has(id))) return false
    const geometry = feature.getGeometry()
    if (!(geometry instanceof Point)) return false
    const pixel = map?.getPixelFromCoordinate(geometry.getCoordinates())
    return pixel && mapFeaturesPointIds(map?.getFeaturesAtPixel(pixel) ?? []).some(id => ids.has(id))
  }))
  if (!visible) { closePointPopup(); return }
  updatePointPopupPosition()
}

function updatePointPopupPosition(): void {
  if (!pointPopupVisible.value || !map || !pointAnchor.value || !mapTarget.value) return
  const point = store.selectedEchoLocation ?? store.selectedNavigationPoint
  const coordinate = point ? [point.coordinate.mapX, point.coordinate.mapY] : pointClickCoordinate
  if (!coordinate) return
  const pixel = map.getPixelFromCoordinate(coordinate)
  const size = map.getSize()
  if (!pixel || !size) return
  const [x = -1, y = -1] = pixel
  const [width = 0, height = 0] = size
  if (x < 0 || y < 0 || x > width || y > height) {
    closePointPopup()
    return
  }
  const rect = mapTarget.value.getBoundingClientRect()
  pointAnchor.value.style.left = `${rect.left + x * canvasRatio.value}px`
  pointAnchor.value.style.top = `${rect.top + y * canvasRatio.value}px`
  pointPopover.value?.updatePosition()
}

watch([pointPopupVisible, () => store.selectedEchoLocation, () => store.selectedNavigationPoint], () => {
  if (!pointPopupVisible.value) { pointPopover.value?.hide(); return }
  updatePointPopupPosition()
  if (pointPopupVisible.value) {
    const view = map?.getView()
    pointPopupView = { center: [...(view?.getCenter() ?? [])], resolution: view?.getResolution() }
    pointPopover.value?.show()
  }
}, { flush: 'post' })

function onPointPopoverClosed(): void {
  // A delayed close event from the previous click must not clear a newly opened selection.
  if (!pointPopover.value?.isOpen) closePointPopup()
}

function onMapMoveStart(): void {
  closeContextMenu()
  const view = map?.getView()
  const center = view?.getCenter()
  if (pointPopupView && view?.getResolution() === pointPopupView.resolution
    && center?.every((value, index) => value === pointPopupView?.center[index])
    && !isMapMoving()) return
  closePointPopup()
}
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
function syncPosition(): void {
  if (!props.editing || editor.busy) return
  editor.syncPosition(contextCoordinate.value)
  closeContextMenu()
}
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
const editorPoints = createPointLayers(isMapMoving, {
  forceVisibleCategory: () => editor.editorMode,
  onStyleChange: () => selectionLayer.changed(),
})
const floors = createFloorLayers(projection, { dimBase: true, onError: store.reportFloorTileError })
const routeLayer = createRouteLayer(points.layers)
const viewport = useMapViewport({
  getMap: () => map,
  getPadding: () => {
    const [top, right, bottom, left] = props.padding
    const ratio = canvasRatio.value
    return [top / ratio, right / ratio, bottom / ratio, left / ratio]
  },
  getSavedViewport: () => mapViewport.value,
  onViewportChanged: store.setMapViewport,
})

useResizeObserver(mapFrame, ([entry]) => {
  if (entry) mapSize.value = [entry.contentRect.width, entry.contentRect.height]
})

function changeCanvasScale(value: number): void {
  // A default fit must become explicit, otherwise reloading would fit at a different logical zoom.
  viewport.publish(true)
  closeContextMenu()
  store.setCanvasScale(value)
}

useResizeObserver(mapTarget, () => {
  map?.updateSize()
  viewport.initializeViewport()
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
    const addingPoint = draft && !editor.allPoints.some(({ id }) => id === draft.id)
    const replaced = new Set(addingPoint ? [draft.id, ...(draft.officialIds ?? []), ...(draft.replacesOfficialIds ?? [])] : [])
    const locations = editorLibraryLocations(editor.allPoints.filter((point) => !isOfficialPointReplaced(point, replaced)), dataset.value, editor.editorMode)
    const matches = (point: { stateId: number, gravityType?: 1 | 2 | null, levelId: string | null }) => point.stateId === store.selectedStateId && matchesGravity(point.gravityType ?? null, store.supportsGravity ? selectedGravity.value : null)
    const echoes = locations.echoLocations.filter((point) => matches(point)
      && (selectedLevelId.value === null || point.levelId === null || point.levelId === selectedLevelId.value))
    editorPoints.update(echoes, locations.navigationPoints.filter(matches), visibleRegionLabels.value, dataset.value.echoes, undefined, selectedLevelId.value)
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
  const arrival = draft.kind === 'navigation' && draft.mode === 'fast-travel'
    ? coordinateInputPreviewXY(editor.arrivalInput, draft.teleportCoordinate ?? { x: null, y: null, z: null }) : null
  if (arrival) {
    const feature = new Feature({ geometry: new Point(gameToMapCoordinate(...arrival)) })
    feature.setStyle((_feature, resolution) => zoomSelectionStyles(arrivalStyle, resolution))
    selectionSource.addFeature(feature)
  }
  const coordinate = coordinateInputPreviewXY(editor.positionInput, draft.coordinate)
  if (!coordinate) return
  const display = authoredPointMapDisplay({ ...draft, coordinate: { ...draft.coordinate, x: coordinate[0], y: coordinate[1] } }, dataset.value)
  if (!display) return
  const feature = new Feature({ geometry: new Point([display.location.coordinate.mapX, display.location.coordinate.mapY]), mapPoint: display })
  const editingExisting = editor.allPoints.some(({ id }) => id === draft.id)
  const selectionStyle = createEditorSelectionStyle(editingExisting ? '编辑中' : '新增')
  feature.setStyle((_feature, resolution) => zoomSelectionStyles(selectionStyle, resolution))
  selectionSource.addFeature(feature)
}

function rebuildRoute(): void {
  const routes = props.editing ? [] : mapRoutes.value
  points.setVisibleRoutes(routes)
  routeLayer.update(routes)
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
  if (selected) viewport.restoreFloorViewport(floorExtent(selected))
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
  if (mapX === undefined || mapY === undefined) return
  const [x, y] = mapToGameCoordinate(mapX, mapY)
  lastGameCoordinate.value = [Math.round(x), Math.round(y)]
}

function updatePointerCoordinate(event: MapBrowserEvent): void {
  if (!event.dragging) updateLastCoordinate(event.coordinate)
}

function applyMapNavigation(): void {
  const request = mapNavigationRequest.value
  if (!request || !map) return
  const region = dataset.value?.regionLabels.find(({ id }) => id === request.regionId)
  if (region) viewport.locate([region.coordinate.mapX, region.coordinate.mapY], mapResolutionForScale(region.level === 3 ? 2 : 4))
  store.completeMapNavigation()
}

function selectMapPoint(event: MapBrowserEvent): void {
  updatePointerCoordinate(event)
  const features = map?.getFeaturesAtPixel(event.pixel, { hitTolerance: 6 }) ?? []
  const found = mapFeaturesPointIds(features)
  if (props.editing) {
    if (found.length) emit('editorPointsSelected', found)
    return
  }
  if (found.length > 0) {
    pointClickCoordinate = [...event.coordinate]
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
    layers: [...points.layers, ...editorPoints.layers, editorGrid, routeLayer.layer, selectionLayer],
    view: new View({ projection, enableRotation: false, center: [0, 0], resolution: 4 }),
  })
  map.on('movestart', onMapMoveStart)
  map.on('postrender', onPointPopupRender)
  map.on('moveend', onMoveEnd)
  map.on('postrender', updateDraftInView)
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
watch([() => editor.positionInput, () => editor.arrivalInput], rebuildDraft)
watch([() => editor.positionInput, () => editor.arrivalInput, () => editor.draft], updateDraftInView)
watch([() => props.editing, mapRoutes], rebuildRoute, { flush: 'post' })
watch(mapNavigationRequest, applyMapNavigation, { flush: 'post' })

onBeforeUnmount(() => {
  map?.un('movestart', onMapMoveStart)
  map?.un('postrender', onPointPopupRender)
  map?.un('moveend', onMoveEnd)
  map?.un('postrender', updateDraftInView)
  map?.un('pointermove', updatePointerCoordinate)
  map?.un('singleclick', selectMapPoint)
  map?.setTarget(undefined)
  floors.dispose()
  points.dispose()
  editorPoints.dispose()
  selectionSource.clear(true)
  routeLayer.dispose()
  baseLayers.dispose()
  editorGrid.dispose()
  map?.dispose()
  map = null
})
</script>

<template>
  <div ref="mapFrameRef" class="relative h-full w-full min-h-0 min-w-0 overflow-hidden">
    <span ref="contextAnchorRef" class="pointer-events-none fixed h-0 w-0" :style="{ left: `${contextPosition.x}px`, top: `${contextPosition.y}px` }" />
    <WuPopover ref="contextMenuRef" :anchor="contextAnchor" :disabled="!editing || editor.busy" width="content" :gap="0" class="rounded-[8px] outline -outline-offset-1 outline-[var(--line)] bg-[#102019] text-[#c7dfd2] shadow-xl">
      <WuButton variant="ghost" :disabled="!editor.draft" @click="syncPosition">同步位置</WuButton>
      <WuButton variant="ghost" @click="requestPoint('navigation')">添加定位</WuButton>
      <WuButton variant="ghost" @click="requestPoint('echo')">添加声骸</WuButton>
    </WuPopover>
    <div ref="pointAnchorRef" class="pointer-events-none fixed h-0 w-0" />
    <WuPopover ref="pointPopoverRef" :anchor="pointAnchor" placement="top" :width="340" :max-height="420" :gap="24" class="rounded-[12px] outline -outline-offset-1 outline-[var(--line)] bg-[#0b1b16f5] shadow-xl" @closed="onPointPopoverClosed">
      <PointDetails v-if="pointPopupVisible" />
    </WuPopover>
    <RouteLegDetailsPopup v-if="!editing && selectedRouteLeg" :details="selectedRouteLeg" @close="selectedRouteLeg = null" />
    <div v-if="baseTileError" class="absolute left-1/2 top-[12px] z-70 flex max-w-[90%] -translate-x-1/2 items-center gap-[10px] rounded-[8px] bg-[#35261eed] px-[12px] py-[8px] text-[12px] text-[#f1d7b4]">
      <span>{{ selectedGravity === 2 ? '反重力' : '' }}底图部分加载失败</span>
      <WuButton size="sm" @click="store.retryBaseTiles">重试</WuButton>
    </div>
    <div
      ref="mapTargetRef"
      :style="canvasStyle"
      @contextmenu="openContextMenu"
      class="absolute left-0 top-0 origin-top-left [background:linear-gradient(rgba(101,241,194,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(101,241,194,0.025)_1px,transparent_1px),#0c1715] [background-size:32px_32px]"
    />
    <div :style="floorDockStyle" class="pointer-events-none absolute bottom-[var(--floor-dock-bottom)] right-[var(--floor-dock-right)] z-70 max-h-[var(--floor-dock-height)] flex flex-col items-start gap-[4px]" :class="shortFloorDock ? 'left-[max(60px,env(safe-area-inset-left))]' : 'left-[max(8px,env(safe-area-inset-left))]'">
      <FloorSwitcher
        :selected-level-id="selectedLevelId" :floor-request="floorRequest" :floor-groups="nearbyFloorGroups"
        :visible="floorSwitcherVisible" :compact-floors="compactFloors"
        @level-requested="store.requestLevel" @layout-toggled="store.toggleFloorLayout"
      />
      <MapCoordinateDisplay :text="pointerCoordinateText" />
      <div class="pointer-events-auto flex items-center gap-[4px] rounded-[6px] bg-[#102019ed] p-[4px] text-[12px]">
        <WuButton size="xs" icon="minus" icon-only :disabled="canvasScale <= 50" tooltip="缩小画布，展示更多地图" @click="changeCanvasScale(Math.max(50, canvasScale - 5))" />
        <WuButton size="xs" class="w-[48px] tabular-nums" tooltip="重置为 100%" @click="changeCanvasScale(100)">{{ canvasScale }}%</WuButton>
        <WuButton size="xs" icon="plus" icon-only :disabled="canvasScale >= 150" tooltip="放大画布" @click="changeCanvasScale(Math.min(150, canvasScale + 5))" />
      </div>
    </div>
  </div>
</template>
