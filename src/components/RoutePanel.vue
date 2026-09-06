<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import WuScrollArea from './base/WuScrollArea.vue'
import { useExplorerStore } from '../stores/explorer.ts'

defineProps<{ compact: boolean }>()
const store = useExplorerStore()
const { allNavigationPoints, route, routeEligibleLocations, routeEligibleNavigationPoints, routeZWeight, visibleEchoLocations, planning, routeError } = storeToRefs(store)
const incompleteCount = computed(() => visibleEchoLocations.value.length - routeEligibleLocations.value.length)
const usesOfficialCoordinates = computed(() => [...routeEligibleLocations.value, ...routeEligibleNavigationPoints.value].some(({ quality }) => quality === 'official-provisional'))
const startPoint = computed(() => allNavigationPoints.value.find(({ id }) => id === route.value?.startPointId) ?? null)

function onRouteZWeightChange(event: Event): void {
  if (event.target instanceof HTMLInputElement) {
    store.setRouteZWeight(Number(event.target.value))
    event.target.value = String(routeZWeight.value)
  }
}
</script>

<template>
  <WuScrollArea class="min-h-0 flex-1" content-class="p-16px" aria-label="路线规划">
    <div class="flex items-center justify-between gap-12px">
      <div>
        <span class="block text-10px text-[#608176] font-800 tracking-[0.18em]">ROUTE LAB</span>
        <div class="mt-4px text-18px text-[#e7f1ec] font-600">三维刷取路线</div>
      </div>
      <span class="shrink-0 rounded-4px border border-[rgba(101,241,194,0.3)] px-6px py-4px text-12px text-[var(--accent)]">XYZ</span>
    </div>
    <div class="my-14px grid grid-cols-[1fr_1fr_1.25fr] gap-7px">
      <div class="flex min-w-0 flex-col justify-center rounded-6px border border-[var(--line)] bg-[#182b25] p-9px">
        <span class="text-20px text-[#d8eee5]">{{ routeEligibleLocations.length }}</span>
        <span class="text-12px text-[#9ab0a7]">可规划</span>
      </div>
      <div class="flex min-w-0 flex-col justify-center rounded-6px border border-[var(--line)] bg-[#182b25] p-9px">
        <span class="text-20px text-[#d8eee5]">{{ incompleteCount }}</span>
        <span class="text-12px text-[#9ab0a7]">待补 XYZ</span>
      </div>
      <label class="flex min-w-0 flex-col justify-center rounded-6px border border-[var(--line)] bg-[#182b25] p-9px">
        <span class="text-12px text-[#9ab0a7]">高度权重</span>
        <input class="mt-3px h-44px w-full min-w-0 rounded-6px border border-[var(--line)] bg-[#152823] px-5px text-16px text-inherit font-inherit outline-none focus:border-[var(--accent)]" :value="routeZWeight" type="number" inputmode="decimal" min="0.1" max="10" step="0.05" @change="onRouteZWeightChange" />
      </label>
    </div>
    <div class="mb-10px text-12px text-[#9ab0a7] leading-relaxed">{{ routeEligibleNavigationPoints.length }} 个可传送起点。未补齐怪物清单的人工点按已知怪物参与路线。</div>
    <div v-if="usesOfficialCoordinates" class="mb-10px text-12px leading-relaxed text-[#e5bd7c]">包含官方点位，Z=0 按占位高度计算。切换“仅人工”可使用实测坐标。</div>
    <div v-if="routeEligibleLocations.length === 0" class="mb-12px rounded-6px bg-[#182b25] p-12px text-14px text-[#b9c9c2]" role="status">
      {{ visibleEchoLocations.length === 0 ? '先在筛选中选择声骸或合鸣效果。' : '当前筛选的声骸尚未录入 XYZ，暂时无法生成路线。' }}
    </div>
    <button class="min-h-44px w-full cursor-pointer rounded-7px border-0 bg-[var(--accent)] px-12px py-10px text-14px text-[#08231d] font-700 disabled:cursor-not-allowed disabled:bg-[#1a2b27] disabled:text-[#8ca399]" type="button" :disabled="planning || routeEligibleLocations.length === 0" @click="store.planRoute">
      {{ planning ? '正在优化…' : '生成当前筛选路线' }}
    </button>
    <button v-if="planning" type="button" class="mt-8px min-h-44px w-full cursor-pointer rounded-7px border border-[var(--line)] bg-transparent text-14px text-[#b9c9c2]" @click="store.clearRoute">取消计算</button>
    <div v-if="routeError" class="mt-12px text-14px text-[#ff9f92]" role="alert">{{ routeError }}</div>
    <div v-if="route" class="mt-14px border-t border-[var(--line)] pt-12px">
      <div class="flex flex-wrap items-center justify-between gap-8px" role="status">
        <span class="rounded-4px bg-[#163e2e] px-7px py-4px text-12px text-[var(--accent)]">{{ route.algorithm === 'exact' ? '精确最优' : '启发式优化' }}</span>
        <span class="text-14px text-[#d8e8e1]">{{ route.totalCost.toFixed(1) }} 距离成本</span>
      </div>
      <div v-if="startPoint" class="mt-10px text-14px text-[#9ab0a7]">起点：{{ startPoint.typeName }}</div>
      <WuScrollArea :unbounded="compact" class="mt-10px min-[1024px]:max-h-240px" role="list" aria-label="路线点位">
        <div v-for="(point, index) in route.points" :key="point.id" class="flex gap-9px border-b border-[var(--line)] py-10px text-14px" role="listitem">
          <span class="w-24px shrink-0 text-right text-[var(--accent)]">{{ index + 1 }}.</span>
          <span class="min-w-0">
            <span class="block text-[#d9e7e1]">{{ point.name }}</span>
            <span class="mt-4px block text-12px text-[#9ab0a7]">{{ point.coordinate.x }}, {{ point.coordinate.y }}, {{ point.coordinate.z }}</span>
          </span>
        </div>
      </WuScrollArea>
      <button type="button" class="mt-10px min-h-44px w-full cursor-pointer rounded-7px border border-[var(--line)] bg-transparent text-14px text-[#b9c9c2]" @click="store.clearRoute">清除路线</button>
    </div>
  </WuScrollArea>
</template>
