<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../stores/explorer.ts'
import { useRouteExportStore } from '../stores/route-export.ts'
import { routeGroupId } from '../route/route-groups.ts'

const store = useExplorerStore()
const exportStore = useRouteExportStore()
const {
  route, routePlan, routeGroupCandidates, routeEligibleLocations, routePlanEligibleLocations, planning,
  planningCompleted, planningTotal, routeError, selectedEchoIds, selectedStateId, selectedLevelId,
  selectedGravity, supportsGravity,
} = storeToRefs(store)
const availableGroups = computed(() => routeGroupCandidates.value.filter(({ locations }) => locations.length > 0))
const currentGroupId = computed(() => routeGroupId(selectedStateId.value, selectedLevelId.value, supportsGravity.value ? selectedGravity.value : 1))
const currentCandidate = computed(() => routeGroupCandidates.value.find(({ id }) => id === currentGroupId.value) ?? null)
const generateAll = computed(() => availableGroups.value.length > 1 || (availableGroups.value.length === 1 && currentCandidate.value?.locations.length === 0))
const displayedEligibleCount = computed(() => generateAll.value ? routePlanEligibleLocations.value.length : routeEligibleLocations.value.length)
const generateDisabled = computed(() => !planning.value && (selectedEchoIds.value.length === 0 || displayedEligibleCount.value === 0))
const generateLabel = computed(() => {
  if (planning.value) return planningTotal.value > 1 ? `取消生成 · ${planningCompleted.value} / ${planningTotal.value}` : '取消生成'
  if (selectedEchoIds.value.length === 0) return '请选择声骸'
  if (displayedEligibleCount.value === 0) return '暂无可规划点位'
  if (routePlan.value || route.value) return '重新生成路线'
  return '生成路线'
})

function generateRoutes(): void {
  if (planning.value) {
    store.clearRoute()
    return
  }
  if (generateAll.value) void store.planAllRoutes()
  else void store.planRoute()
}
</script>

<template>
  <div class="p-16px">
    <button
      class="min-h-44px w-full cursor-pointer rounded-7px border px-12px py-10px text-14px font-700 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[#1a2b27] disabled:text-[#8ca399]"
      :class="planning ? 'border-[var(--line)] bg-transparent text-[#b9c9c2]' : 'border-transparent bg-[var(--accent)] text-[#08231d]'"
      type="button"
      :disabled="generateDisabled"
      @click="generateRoutes"
    >
      {{ generateLabel }}
    </button>
    <button v-if="routePlan || route" type="button" class="mt-8px min-h-40px w-full cursor-pointer rounded-7px border border-[var(--line)] bg-transparent px-12px text-13px text-[#a8f6d5] disabled:cursor-not-allowed disabled:text-[#60756c]" :disabled="exportStore.status === 'running'" @click="exportStore.start">{{ exportStore.status === 'running' ? '正在导出…' : '导出路线' }}</button>
    <div v-if="routeError" class="mt-8px text-12px text-[#ff9f92]">{{ routeError }}</div>
  </div>
</template>
