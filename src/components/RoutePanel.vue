<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import WuScrollArea from './base/WuScrollArea.vue'
import { useExplorerStore } from '../stores/explorer.ts'
import { useRouteExportStore } from '../stores/route-export.ts'

defineProps<{ compact: boolean }>()
const store = useExplorerStore()
const exportStore = useRouteExportStore()
const { route, routeEligibleLocations, routeEligibleNavigationPoints, visibleEchoLocations, planning, routeError } = storeToRefs(store)
const incompleteCount = computed(() => visibleEchoLocations.value.length - routeEligibleLocations.value.length)
const usesOfficialCoordinates = computed(() => [...routeEligibleLocations.value, ...routeEligibleNavigationPoints.value].some(({ quality }) => quality === 'official-provisional'))
</script>

<template>
  <WuScrollArea class="min-h-0 flex-1" content-class="p-16px">
    <div class="flex items-center justify-between gap-12px">
      <div>
        <span class="block text-10px text-[#608176] font-800 tracking-[0.18em]">ROUTE LAB</span>
        <div class="mt-4px text-18px text-[#e7f1ec] font-600">三维刷取路线</div>
      </div>
      <span class="shrink-0 rounded-4px border border-[rgba(101,241,194,0.3)] px-6px py-4px text-12px text-[var(--accent)]">XYZ</span>
    </div>
    <div class="my-14px grid grid-cols-2 gap-7px">
      <div class="flex min-w-0 flex-col justify-center rounded-6px border border-[var(--line)] bg-[#182b25] p-9px">
        <span class="text-20px text-[#d8eee5]">{{ routeEligibleLocations.length }}</span>
        <span class="text-12px text-[#9ab0a7]">可规划</span>
      </div>
      <div class="flex min-w-0 flex-col justify-center rounded-6px border border-[var(--line)] bg-[#182b25] p-9px">
        <span class="text-20px text-[#d8eee5]">{{ incompleteCount }}</span>
        <span class="text-12px text-[#9ab0a7]">待补 XYZ</span>
      </div>
    </div>
    <div class="mb-10px text-12px text-[#9ab0a7] leading-relaxed">{{ routeEligibleNavigationPoints.length }} 个可用传送点，每一步选择步行距离更短的走法。未补齐怪物清单的人工点按已知怪物参与路线。</div>
    <div v-if="usesOfficialCoordinates" class="mb-10px text-12px leading-relaxed text-[#e5bd7c]">包含官方点位，Z=0 按占位高度计算。切换“仅人工”可使用实测坐标。</div>
    <div v-if="routeEligibleLocations.length === 0" class="mb-12px rounded-6px bg-[#182b25] p-12px text-14px text-[#b9c9c2]">
      {{ visibleEchoLocations.length === 0 ? '先在筛选结果中选择最终声骸目标。' : '当前目标声骸尚未录入 XYZ，暂时无法生成路线。' }}
    </div>
    <button class="min-h-44px w-full cursor-pointer rounded-7px border-0 bg-[var(--accent)] px-12px py-10px text-14px text-[#08231d] font-700 disabled:cursor-not-allowed disabled:bg-[#1a2b27] disabled:text-[#8ca399]" type="button" :disabled="planning || routeEligibleLocations.length === 0" @click="store.planRoute">
      {{ planning ? '正在优化…' : '生成当前筛选路线' }}
    </button>
    <button v-if="planning" type="button" class="mt-8px min-h-44px w-full cursor-pointer rounded-7px border border-[var(--line)] bg-transparent text-14px text-[#b9c9c2]" @click="store.clearRoute">取消计算</button>
    <div v-if="routeError" class="mt-12px text-14px text-[#ff9f92]">{{ routeError }}</div>
    <div v-if="route" class="mt-14px border-t border-[var(--line)] pt-12px">
      <button type="button" class="mb-12px min-h-44px w-full rounded-7px border border-[#65f1c2] bg-[#163e2e] px-12px text-14px text-[#a8f6d5] disabled:opacity-50" :disabled="planning || exportStore.status === 'running'" @click="exportStore.start">导出路线长图</button>
      <div class="flex flex-wrap items-center justify-between gap-8px">
        <span class="rounded-4px bg-[#163e2e] px-7px py-4px text-12px text-[var(--accent)]">{{ route.algorithm === 'exact' ? '精确最优' : '启发式优化' }}</span>
        <span class="text-14px text-[#d8e8e1]">{{ route.totalCost.toFixed(1) }} 距离成本</span>
      </div>
      <WuScrollArea :unbounded="compact" class="mt-10px min-[1024px]:max-h-240px">
        <div v-for="(point, index) in route.points" :key="point.id" class="flex gap-9px border-b border-[var(--line)] py-10px text-14px">
          <span class="w-24px shrink-0 text-right text-[var(--accent)]">{{ index + 1 }}.</span>
          <span class="min-w-0">
            <span v-if="point.teleportFrom" class="mb-4px block text-12px text-[var(--accent)]">传送至 {{ point.teleportFrom.name }}（{{ point.teleportFrom.coordinate.x }}, {{ point.teleportFrom.coordinate.y }}, {{ point.teleportFrom.coordinate.z }}）后前往</span>
            <span class="block text-[#d9e7e1]">{{ point.name }}</span>
            <span class="mt-4px block text-12px text-[#9ab0a7]">{{ point.coordinate.x }}, {{ point.coordinate.y }}, {{ point.coordinate.z }}</span>
          </span>
        </div>
      </WuScrollArea>
      <button type="button" class="mt-10px min-h-44px w-full cursor-pointer rounded-7px border border-[var(--line)] bg-transparent text-14px text-[#b9c9c2]" @click="store.clearRoute">清除路线</button>
    </div>
  </WuScrollArea>
</template>
