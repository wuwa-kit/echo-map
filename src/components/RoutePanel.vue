<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'
import WuScrollArea from './base/WuScrollArea.vue'
import { useExplorerStore } from '../stores/explorer.ts'
import { planRouteInWorker } from '../route/worker-client.ts'
import type { RoutePoint } from '../domain/types.ts'

const store = useExplorerStore()
const {
  controlPanelCollapsed,
  dataset,
  route,
  routeEligibleLocations,
  routeEligibleNavigationPoints,
  routeZWeight,
  selectedStateId,
  visibleEchoLocations,
} = storeToRefs(store)
const planning = shallowRef(false)
const errorMessage = shallowRef('')
const incompleteCount = computed(() => visibleEchoLocations.value.length - routeEligibleLocations.value.length)
const echoNameById = computed(() => new Map(dataset.value?.echoes.map((echo) => [echo.id, echo.name]) ?? []))
const startPoint = computed(() => dataset.value?.navigationPoints.find(({ id }) => id === route.value?.startPointId) ?? null)

function asRoutePoint(location: typeof routeEligibleLocations.value[number]): RoutePoint {
  if (!location.gameCoordinate) {
    throw new Error(`点位 ${location.id} 缺少 XYZ`)
  }
  return {
    id: location.id,
    name: echoNameById.value.get(location.echoId) ?? location.typeName,
    echoId: location.echoId,
    stateId: location.stateId,
    levelId: location.levelId,
    coordinate: location.gameCoordinate,
    mapCoordinate: [location.coordinate.mapX, location.coordinate.mapY],
  }
}

function onRouteZWeightChange(event: Event): void {
  store.setRouteZWeight(Number((event.target as HTMLInputElement).value))
}

async function plan(): Promise<void> {
  planning.value = true
  errorMessage.value = ''
  try {
    const points = routeEligibleLocations.value.map(asRoutePoint)
    const startPoints: RoutePoint[] = routeEligibleNavigationPoints.value.map((location) => {
      if (!location.gameCoordinate) {
        throw new Error(`路线起点 ${location.id} 缺少 XYZ`)
      }
      return {
        id: location.id,
        name: location.typeName,
        echoId: null,
        stateId: location.stateId,
        levelId: location.levelId,
        coordinate: location.gameCoordinate,
        mapCoordinate: [location.coordinate.mapX, location.coordinate.mapY],
      }
    })
    store.setRoute(await planRouteInWorker({
      points,
      startPoints,
      connectors: (dataset.value?.connectors ?? []).filter(({ stateId }) => stateId === selectedStateId.value),
      zWeight: routeZWeight.value,
    }))
  } catch (error) {
    store.clearRoute()
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    planning.value = false
  }
}
</script>

<template>
  <WuScrollArea
    class="absolute top-18px max-h-[calc(100%_-_76px)] w-[min(315px,calc(100%_-_36px))] border border-[rgba(166,210,193,0.18)] rounded-9px bg-[rgba(7,17,15,0.9)] shadow-[0_18px_50px_rgba(0,0,0,0.27)] backdrop-blur-14px transition-[right] duration-220 ease max-[900px]:w-275px max-[680px]:top-12px"
    content-class="p-16px"
    :class="controlPanelCollapsed
      ? 'right-18px max-[680px]:right-12px'
      : 'right-[calc(var(--control-panel-width)+18px)] max-[680px]:hidden'"
    aria-label="路线规划"
  >
    <div class="flex items-center justify-between gap-12px">
      <div>
        <span class="block text-8px text-[#608176] font-800 tracking-[0.18em]">ROUTE LAB</span>
        <div class="mt-4px text-16px text-[#e7f1ec] font-[650]">三维刷取路线</div>
      </div>
      <span class="border border-[rgba(101,241,194,0.3)] rounded-4px px-6px py-4px text-8px text-[var(--accent)] font-600 tracking-[0.09em]">XYZ ONLY</span>
    </div>
    <div class="my-14px mb-10px grid grid-cols-[1fr_1fr_1.25fr] gap-7px">
      <div class="flex h-54px min-w-0 flex-col justify-center border border-[var(--line)] rounded-6px bg-[rgba(24,43,37,0.68)] px-9px py-7px">
        <span class="text-17px text-[#d8eee5] font-600">{{ routeEligibleLocations.length }}</span>
        <span class="text-8px text-[#7f968d]">可规划</span>
      </div>
      <div class="flex h-54px min-w-0 flex-col justify-center border border-[var(--line)] rounded-6px bg-[rgba(24,43,37,0.68)] px-9px py-7px">
        <span class="text-17px text-[#d8eee5] font-600">{{ incompleteCount }}</span>
        <span class="text-8px text-[#7f968d]">待补 XYZ</span>
      </div>
      <label class="flex h-54px min-w-0 flex-col justify-center border border-[var(--line)] rounded-6px bg-[rgba(24,43,37,0.68)] px-9px py-7px">
        <span class="text-8px text-[#7f968d]">高度权重</span>
        <input
          class="mt-3px h-23px w-full border border-[var(--line)] rounded-7px bg-[rgba(21,40,35,0.78)] px-5px text-10px text-inherit font-inherit outline-none focus:border-[rgba(101,241,194,0.55)]"
          :value="routeZWeight"
          type="number"
          min="0.1"
          max="10"
          step="0.05"
          @change="onRouteZWeightChange"
        />
      </label>
    </div>
    <div class="mb-10px text-9px text-[#82988f] leading-[1.55]">
      已核验 {{ routeEligibleNavigationPoints.length }} 个可传送路线起点；缺少 XYZ 的定位点只显示，不会混入路线。
    </div>
    <div v-if="incompleteCount > 0" class="mb-10px text-9px text-[#82988f] leading-[1.55]">灰色虚线声骸点只用于定位，不会以 z=0 混入路线。</div>
    <button
      class="w-full cursor-pointer border-0 rounded-6px bg-gradient-to-br from-[#8bf7d3] to-[#58cfa8] px-12px py-10px text-11px text-[#08231d] font-[750] font-inherit shadow-[0_8px_24px_rgba(69,208,159,0.15)] disabled:cursor-not-allowed disabled:bg-[#1a2b27] disabled:bg-none disabled:text-[#637b72] disabled:shadow-none"
      type="button"
      :disabled="planning || routeEligibleLocations.length === 0"
      @click="plan"
    >
      {{ planning ? '正在优化…' : '生成当前筛选路线' }}
    </button>
    <div v-if="errorMessage" class="mt-9px text-10px text-[#ff9f92]" role="alert">{{ errorMessage }}</div>
    <div v-if="route" class="mt-13px border-t border-[var(--line)] pt-12px">
      <div class="flex items-center justify-between gap-12px">
        <span class="rounded-4px bg-[rgba(101,241,194,0.1)] px-6px py-3px text-8px text-[var(--accent)]">{{ route.algorithm === 'exact' ? '精确最优' : '启发式优化' }}</span>
        <span class="text-10px text-[#d8e8e1]">{{ route.totalCost.toFixed(1) }} 距离成本</span>
      </div>
      <div v-if="startPoint" class="mb-10px mt-8px text-9px text-[#82988f] leading-[1.55]">起点：{{ startPoint.typeName }}</div>
      <WuScrollArea class="mt-8px max-h-165px" role="list">
        <div
          v-for="(point, index) in route.points"
          :key="point.id"
          class="flex gap-7px py-4px pb-6px text-10px"
          role="listitem"
        >
          <span class="w-18px shrink-0 text-right text-[var(--accent)]">{{ index + 1 }}.</span>
          <span class="min-w-0">
            <span class="block text-[#d9e7e1]">{{ point.name }}</span>
            <span class="mt-2px block text-8px text-[#71877e]">{{ point.coordinate.x }}, {{ point.coordinate.y }}, {{ point.coordinate.z }}</span>
          </span>
        </div>
      </WuScrollArea>
    </div>
  </WuScrollArea>
</template>
