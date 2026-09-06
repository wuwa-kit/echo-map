<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import Map from 'ol/Map.js'
import View from 'ol/View.js'
import Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import Projection from 'ol/proj/Projection.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import { defaults as controls } from 'ol/control/defaults.js'
import type MapBrowserEvent from 'ol/MapBrowserEvent.js'
import { createOfficialTileLayer } from '../map/official-source.ts'
import { createFloorLayers } from '../map/floor-layers.ts'
import { gameToMapCoordinate, mapToGameCoordinate } from '../map/projection.ts'
import { createEditorMarkerStyles } from '../map/editor-marker.ts'
import type { AuthoredPoint, MapDataset } from '../domain/types.ts'

const props = defineProps<{
  dataset: MapDataset
  points: readonly AuthoredPoint[]
  draft: AuthoredPoint
  savedViewport: {
    center: [number, number]
    zoom: number
  } | null
}>()
const emit = defineEmits<{
  pointSelected: [id: string]
  positionPicked: [x: number, y: number]
  viewportChanged: [viewport: {
    center: [number, number]
    zoom: number
  } | null]
}>()
const mapTarget = useTemplateRef<HTMLElement>('mapTargetRef')
const state = computed(() => props.dataset.states.find(({ id }) => id === props.draft.stateId))
let map: Map | null = null
let base: ReturnType<typeof createOfficialTileLayer> | null = null
let defaultViewport: {
  center: number[]
  zoom: number
} | null = null
const source = new VectorSource()
const layer = new VectorLayer({ source, zIndex: 40, declutter: true })
const projection = new Projection({ code: 'KURO:CRS-SIMPLE', units: 'pixels' })
const floors = createFloorLayers(projection)
const icons = createEditorMarkerStyles(() => layer.changed())

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

function focusDraft(): void {
  const { x, y } = props.draft.coordinate
  if (x === null || y === null || !map) return
  map.getView().setCenter(gameToMapCoordinate(x, y, props.dataset.source.tileWidth))
  map.getView().setResolution(Math.min(map.getView().getResolution() ?? 1, 0.65))
}

function rebuildPoints(): void {
  source.clear(true)
  const points = [...props.points.filter(({ id }) => id !== props.draft.id), props.draft]
  source.addFeatures(points.flatMap((point) => {
    const { x, y } = point.coordinate
    if (point.stateId !== props.draft.stateId || point.levelId !== props.draft.levelId || x === null || y === null) return []
    const feature = new Feature({ geometry: new Point(gameToMapCoordinate(x, y, props.dataset.source.tileWidth)), pointId: point.id })
    feature.setStyle(icons.get(point, props.dataset.echoes, point.id === props.draft.id))
    return [feature]
  }))
}

function rebuildFloor(): void {
  if (!map || !state.value) return
  floors.update(map, state.value, props.dataset.source, props.draft.levelId)
  const extent = floors.getExtent()
  if (extent && !props.savedViewport) map.getView().fit(extent, { padding: [50, 50, 50, 50], minResolution: 0.5 })
  rebuildPoints()
}

function rebuildBase(): void {
  if (!map || !state.value) return
  if (base) {
    map.removeLayer(base)
    base.getSource()?.dispose()
    base.dispose()
  }
  base = createOfficialTileLayer(state.value, props.dataset.source)
  map.getLayers().insertAt(0, base)
  const extent = state.value.tileExtent.extent
  const size = Math.max(extent[2] - extent[0], extent[3] - extent[1])
  map.setView(new View({ projection, enableRotation: false, center: props.savedViewport?.center ?? [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2], resolution: Math.max(1, size / 1300), minResolution: 0.14, maxResolution: Math.max(2, size / 500) }))
  defaultViewport = { center: [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2], zoom: map.getView().getZoom() ?? 0 }
  if (props.savedViewport) map.getView().setZoom(props.savedViewport.zoom)
  rebuildFloor()
}

function select(event: MapBrowserEvent): void {
  const id: unknown = map?.forEachFeatureAtPixel(event.pixel, (feature) => feature.get('pointId'), { hitTolerance: 6 })
  if (typeof id === 'string') emit('pointSelected', id)
  else {
    const [x, y] = event.coordinate
    if (x !== undefined && y !== undefined) emit('positionPicked', ...mapToGameCoordinate(x, y, props.dataset.source.tileWidth))
  }
}

useResizeObserver(mapTarget, () => map?.updateSize())
onMounted(() => {
  if (!mapTarget.value) return
  map = new Map({ target: mapTarget.value, controls: controls({ rotate: false }), layers: [layer], view: new View({ projection, center: [0, 0], resolution: 4, enableRotation: false }) })
  map.on('singleclick', select)
  map.on('moveend', publish)
  rebuildBase()
  if (!props.savedViewport) focusDraft()
})
watch(state, rebuildBase)
watch(() => props.draft.levelId, rebuildFloor)
watch([() => props.points, () => props.draft], rebuildPoints)
watch([() => props.draft.id, () => props.draft.coordinate.x, () => props.draft.coordinate.y], focusDraft)
onBeforeUnmount(() => {
  map?.un('singleclick', select)
  map?.un('moveend', publish)
  map?.setTarget(undefined)
  floors.dispose()
  base?.getSource()?.dispose()
  base?.dispose()
  source.dispose()
  layer.dispose()
  icons.dispose()
  map?.dispose()
})
</script>

<template>
  <div class="relative h-full min-h-240px bg-[#0c1715]">
    <div ref="mapTargetRef" class="absolute inset-0" aria-label="点位录入地图" />
    <div class="pointer-events-none absolute bottom-12px left-12px right-12px w-fit rounded-8px bg-[#0c211be8] px-12px py-8px text-12px text-[#b5cec1]">点击已有点位编辑 · 点击空白处填写参考 XY · 金色虚线菱形为当前点</div>
  </div>
</template>
