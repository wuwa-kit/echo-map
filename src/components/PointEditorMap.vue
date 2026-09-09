<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import Map from 'ol/Map.js'
import View from 'ol/View.js'
import Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import Projection from 'ol/proj/Projection.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { defaults as defaultControls } from 'ol/control/defaults.js'
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js'
import type MapBrowserEvent from 'ol/MapBrowserEvent.js'
import { createOfficialBaseLayers } from '../map/official-base-layers.ts'
import { hasGravityMap, matchesGravity } from '../domain/gravity.ts'
import { authoredPointMapDisplay, editorLibraryLocations } from '../domain/point-library.ts'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { createFloorLayers } from '../map/floor-layers.ts'
import { mapToGameCoordinate } from '../map/projection.ts'
import { createEditorSelectionStyle } from '../map/editor-marker.ts'
import { createPointLayers, mapFeaturesPointIds } from '../map/point-layers.ts'
import { createMapView } from '../map/useMapViewport.ts'
import { createFloorCoverage, floorGroupsInViewport } from '../map/floor-coverage.ts'
import { MAP_ZOOM_LEVELS, mapZoomForResolution } from '../map/point-visibility.ts'
import type { AuthoredPoint, MapDataset, PointLocationBase } from '../domain/types.ts'
import FloorSwitcher from './FloorSwitcher.vue'
import GravitySwitcher from './GravitySwitcher.vue'
import MapCoordinateDisplay from './MapCoordinateDisplay.vue'
import MapNavigationCascader from './MapNavigationCascader.vue'

const props = defineProps<{
  dataset: MapDataset
  points: readonly AuthoredPoint[]
  draft: AuthoredPoint
  compact: boolean
  compactFloors: boolean
  savedViewport: {
    center: [number, number]
    zoom: number
  } | null
}>()
const emit = defineEmits<{
  pointSelected: [ids: string[]]
  positionPicked: [x: number, y: number]
  viewportChanged: [viewport: {
    center: [number, number]
    zoom: number
  } | null]
  floorLayoutToggled: []
}>()
const mapTarget = useTemplateRef<HTMLElement>('mapTargetRef')
const state = computed(() => props.dataset.states.find(({ id }) => id === props.draft.stateId))
const floorCoverage = computed(() => createFloorCoverage(state.value ?? null, props.dataset.source.tileWidth))
const nearbyFloorGroupIds = shallowRef<string[]>([])
const floorSwitcherVisible = shallowRef(false)
const floorGroups = computed(() => {
  const selected = state.value?.layeredMaps.find(({ floors }) => floors.some(({ id }) => id === props.draft.levelId))
  return state.value?.layeredMaps.filter(({ id }) => id === selected?.id || nearbyFloorGroupIds.value.includes(id)) ?? []
})
const selectedGravity = computed(() => props.draft.gravityType ?? 1)
const mapCenter = shallowRef<[number, number] | null>(null)
const lastGameCoordinate = shallowRef<[number, number]>([0, 0])
const pointerCoordinateText = computed(() => lastGameCoordinate.value.join(' · '))
let map: Map | null = null
let pendingMapPick: {
  pointId: string
  x: number
  y: number
} | null = null
let pendingRegionId: string | null = null
const store = usePointEditorStore()
const baseLayers = createOfficialBaseLayers(store.reportMapTileError)
let defaultViewport: {
  center: number[]
  zoom: number
} | null = null
const selectionSource = new VectorSource()
const selectionLayer = new VectorLayer({
  source: selectionSource,
  zIndex: 60,
  updateWhileAnimating: true,
  updateWhileInteracting: true,
})
const projection = new Projection({ code: 'KURO:CRS-SIMPLE', units: 'pixels' })
const floors = createFloorLayers(projection)
const points = createPointLayers(() => {
  const view = map?.getView()
  return Boolean(view?.getAnimating() || view?.getInteracting())
}, { echoGrouping: 'individual', onStyleChange: () => selectionLayer.changed() })
const selectionStyle = createEditorSelectionStyle()

function publish(): void {
  const center = map?.getView().getCenter()
  const zoom = map?.getView().getZoom()
  const x = center?.[0]
  const y = center?.[1]
  if (x !== undefined && y !== undefined && zoom !== undefined) {
    const isDefault = defaultViewport && Math.abs(x - (defaultViewport.center[0] ?? 0)) < 0.01 && Math.abs(y - (defaultViewport.center[1] ?? 0)) < 0.01 && Math.abs(zoom - defaultViewport.zoom) < 0.0001
    emit('viewportChanged', isDefault ? null : { center: [x, y], zoom })
  }
}

function updateLastCoordinate(coordinate: number[] | undefined): void {
  const mapX = coordinate?.[0]
  const mapY = coordinate?.[1]
  if (mapX === undefined || mapY === undefined) return
  const [x, y] = mapToGameCoordinate(mapX, mapY, props.dataset.source.tileWidth)
  lastGameCoordinate.value = [Math.round(x), Math.round(y)]
}

function updatePointerCoordinate(event: MapBrowserEvent): void {
  if (!event.dragging) updateLastCoordinate(event.coordinate)
}

function updateFloorControls(): void {
  const currentMap = map
  const resolution = currentMap?.getView().getResolution()
  if (!currentMap || resolution === undefined) {
    floorSwitcherVisible.value = false
    nearbyFloorGroupIds.value = []
    return
  }
  floorSwitcherVisible.value = mapZoomForResolution(resolution) >= MAP_ZOOM_LEVELS.local.minZoom
  nearbyFloorGroupIds.value = floorSwitcherVisible.value
    ? floorGroupsInViewport(floorCoverage.value, currentMap.getView().calculateExtent(currentMap.getSize()))
    : []
}

function locateRegion(id: string): void {
  const destination = props.dataset.regionLabels.find((region) => region.id === id)
  if (!destination || !map) return
  const center: [number, number] = [destination.coordinate.mapX, destination.coordinate.mapY]
  const view = map.getView()
  view.cancelAnimations()
  view.setResolution(2.3)
  view.setCenter(center)
  mapCenter.value = center
  updateLastCoordinate(center)
  pendingRegionId = null
  publish()
}

function selectRegion(id: string): void {
  const destination = props.dataset.regionLabels.find((region) => region.id === id)
  if (!destination) return
  pendingRegionId = id
  if (destination.stateId !== props.draft.stateId) {
    store.selectState(destination.stateId)
    store.setCountry(destination.countryId)
    return
  }
  if (props.draft.countryId !== destination.countryId) store.setCountry(destination.countryId)
  if (props.draft.levelId !== null) store.setLevel(null)
  locateRegion(id)
}

function focusDraft(): void {
  const display = authoredPointMapDisplay(props.draft, props.dataset)
  if (!display || !map) return
  map.getView().setCenter([display.location.coordinate.mapX, display.location.coordinate.mapY])
  map.getView().setResolution(Math.min(map.getView().getResolution() ?? 1, 0.65))
}

function activeGravity(): 1 | 2 | null {
  return hasGravityMap(state.value) ? props.draft.gravityType ?? 1 : null
}

function matchesContext(point: PointLocationBase): boolean {
  return point.stateId === props.draft.stateId && matchesGravity(point.gravityType, activeGravity())
}

function rebuildLibraryPoints(): void {
  const replaced = new Set([props.draft.id, ...(props.draft.officialIds ?? []), ...(props.draft.replacesOfficialIds ?? [])])
  const locations = editorLibraryLocations(props.points.filter(({ id }) => !replaced.has(id)), props.dataset)
  const levelId = props.draft.levelId
  const echoLocations = locations.echoLocations.filter((point) => matchesContext(point)
    && (levelId === null || point.levelId === null || point.levelId === levelId))
  const navigationPoints = locations.navigationPoints.filter((point) => matchesContext(point)
    && (levelId === null || point.levelId === null || point.levelId === levelId || point.mode === 'fast-travel'))
  const regionLabels = props.dataset.regionLabels.filter(({ stateId }) => stateId === props.draft.stateId)
  points.update(echoLocations, navigationPoints, regionLabels, props.dataset.echoes, undefined, levelId)
}

function rebuildDraft(): void {
  selectionSource.clear(true)
  const display = authoredPointMapDisplay(props.draft, props.dataset)
  if (!display) return
  const styles = points.styleFor(display)
  const feature = new Feature({
    geometry: new Point([display.location.coordinate.mapX, display.location.coordinate.mapY]),
    mapPoint: display,
  })
  feature.setStyle([selectionStyle, ...(Array.isArray(styles) ? styles : styles ? [styles] : [])])
  selectionSource.addFeature(feature)
}

function rebuildFloor(): void {
  if (!map || !state.value) return
  floors.update(map, state.value, props.dataset.source, props.draft.levelId)
  const extent = floors.getExtent()
  if (extent && !props.savedViewport) map.getView().fit(extent, { padding: [50, 50, 50, 50], minResolution: 0.5 })
}

function rebuildBase(): void {
  if (!map || !state.value) return
  baseLayers.update(map, state.value, props.dataset.source, props.draft.gravityType ?? 1)
  const view = createMapView(state.value, projection)
  const center = view.getCenter()
  const zoom = view.getZoom()
  defaultViewport = center && zoom !== undefined ? { center: [...center], zoom } : null
  if (props.savedViewport) {
    view.setCenter([...props.savedViewport.center])
    view.setZoom(props.savedViewport.zoom)
  }
  map.setView(view)
  const viewCenter = view.getCenter()
  if (viewCenter) mapCenter.value = [viewCenter[0] ?? 0, viewCenter[1] ?? 0]
  updateLastCoordinate(viewCenter)
  rebuildFloor()
  rebuildLibraryPoints()
  rebuildDraft()
  updateFloorControls()
  if (pendingRegionId) locateRegion(pendingRegionId)
}

function onMoveEnd(): void {
  const view = map?.getView()
  const resolution = view?.getResolution()
  if (view && resolution !== undefined) points.finishInteraction(view.calculateExtent(map?.getSize()), resolution, projection)
  const center = view?.getCenter()
  if (center) mapCenter.value = [center[0] ?? 0, center[1] ?? 0]
  updateFloorControls()
  publish()
}

function select(event: MapBrowserEvent): void {
  const ids = map ? mapFeaturesPointIds(map.getFeaturesAtPixel(event.pixel, { hitTolerance: 6 })) : []
  if (ids.length) emit('pointSelected', ids)
  else {
    const [x, y] = event.coordinate
    if (x !== undefined && y !== undefined) {
      const [gameX, gameY] = mapToGameCoordinate(x, y, props.dataset.source.tileWidth)
      pendingMapPick = { pointId: props.draft.id, x: Math.round(gameX), y: Math.round(gameY) }
      emit('positionPicked', gameX, gameY)
    }
  }
}

useResizeObserver(mapTarget, () => {
  map?.updateSize()
  updateFloorControls()
})
onMounted(() => {
  if (!mapTarget.value) return
  map = new Map({
    target: mapTarget.value,
    controls: defaultControls({ attribution: false, rotate: false, zoom: false }),
    interactions: defaultInteractions({ pinchRotate: false, altShiftDragRotate: false }),
    layers: [...points.layers, selectionLayer],
    view: new View({ projection, center: [0, 0], resolution: 4, enableRotation: false }),
  })
  map.on('singleclick', select)
  map.on('moveend', onMoveEnd)
  map.on('pointermove', updatePointerCoordinate)
  rebuildBase()
  if (!props.savedViewport) focusDraft()
})
watch(state, rebuildBase)
watch(() => props.draft.gravityType, () => {
  if (map && state.value) baseLayers.update(map, state.value, props.dataset.source, props.draft.gravityType ?? 1)
})
watch(() => store.mapTileRetry, () => baseLayers.retry())
watch(() => props.draft.levelId, rebuildFloor)
watch([() => props.points, () => props.draft.id, () => props.draft.stateId, () => props.draft.levelId, () => props.draft.gravityType], rebuildLibraryPoints)
watch(() => props.draft, rebuildDraft)
watch([() => props.draft.id, () => props.draft.coordinate.x, () => props.draft.coordinate.y], ([pointId, x, y]) => {
  const picked = pendingMapPick
  pendingMapPick = null
  if (picked?.pointId === pointId && picked.x === x && picked.y === y) return
  focusDraft()
})
onBeforeUnmount(() => {
  map?.un('singleclick', select)
  map?.un('moveend', onMoveEnd)
  map?.un('pointermove', updatePointerCoordinate)
  map?.setTarget(undefined)
  floors.dispose()
  baseLayers.dispose()
  points.dispose()
  selectionSource.dispose()
  selectionLayer.dispose()
  map?.dispose()
})
</script>

<template>
  <div class="relative h-full min-h-240px bg-[#0c1715]">
    <div ref="mapTargetRef" class="absolute inset-0" />
    <div class="absolute left-[max(8px,env(safe-area-inset-left))] top-[max(8px,env(safe-area-inset-top))] z-90 flex items-start gap-4px">
      <MapNavigationCascader
        id="editor-map-navigation-trigger" :dataset="dataset" :state-id="draft.stateId" :center="mapCenter"
        :class="compact ? '[--wu-cascader-height:44px] [--wu-cascader-gap:4px] [--wu-cascader-padding:9px]' : '[--wu-cascader-height:40px] [--wu-cascader-gap:6px] [--wu-cascader-padding:11px]'"
        @region-selected="selectRegion"
      />
      <GravitySwitcher
        :compact="compact" :selected-gravity="selectedGravity" :supports-gravity="hasGravityMap(state)"
        @gravity-selected="store.selectGravity"
      />
    </div>
    <div class="pointer-events-none absolute bottom-[max(8px,env(safe-area-inset-bottom))] left-[max(8px,env(safe-area-inset-left))] top-60px z-70 max-w-[calc(100%-16px)] flex flex-col items-start justify-end gap-4px">
      <FloorSwitcher
        :selected-level-id="draft.levelId" :floor-groups="floorGroups" :visible="floorSwitcherVisible" :compact-floors="compactFloors"
        @level-requested="store.setLevel" @layout-toggled="emit('floorLayoutToggled')"
      />
      <MapCoordinateDisplay :text="pointerCoordinateText" />
    </div>
    <div v-if="store.mapTileError" class="absolute right-12px top-12px z-70 rounded-8px bg-[#35261eed] p-8px text-12px text-[#f1d7b4]">底图部分加载失败<button type="button" class="ml-8px min-h-32px rounded-5px border border-[#a27f58] bg-transparent px-8px text-inherit" @click="store.retryMapTiles">重试</button></div>
  </div>
</template>
