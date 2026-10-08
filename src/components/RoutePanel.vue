<script setup lang="ts">
import WuButton from './base/WuButton.vue'
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
const exportDisabled = computed(() => planning.value || (!routePlan.value && !route.value) || exportStore.status === 'running')
const generateLabel = computed(() => {
  if (planning.value) return planningTotal.value > 1 ? `取消生成 · ${planningCompleted.value} / ${planningTotal.value}` : '取消生成'
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
  <div v-if="selectedEchoIds.length > 0" class="p-[16px]">
    <div class="grid grid-cols-2 gap-[8px]">
      <WuButton class="w-full" size="lg" :variant="planning ? 'outline' : 'solid'" :tone="planning ? 'neutral' : 'accent'" :disabled="generateDisabled" @click="generateRoutes">
        {{ generateLabel }}
      </WuButton>
      <WuButton class="w-full" size="lg" tone="accent" :disabled="exportDisabled" :loading="exportStore.status === 'running'" @click="exportStore.start">导出路线图片</WuButton>
    </div>
    <div v-if="routeError" class="mt-[8px] text-[12px] text-[#ff9f92]">{{ routeError }}</div>
  </div>
</template>
