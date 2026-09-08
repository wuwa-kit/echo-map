<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../../stores/explorer.ts'
import WuScrollArea from '../base/WuScrollArea.vue'
import WuCheckBox from '../base/WuCheckBox.vue'
import WuInput from '../base/WuInput.vue'
import WuMultiSelect from '../base/WuMultiSelect.vue'
import WuSvg from '../base/WuSvg.vue'
import { echoMembers } from '../../domain/point-library.ts'
import { matchesGravity } from '../../domain/gravity.ts'
import type { EchoCostFilter } from '../../url/explorer-url.ts'

defineProps<{ compact: boolean }>()

const store = useExplorerStore()
const { supportsGravity, selectedGravity } = storeToRefs(store)
const { dataset, allEchoLocations, candidateEchoes, echoCostFilters, echoSearch, filteredEchoes, selectedEchoIds, selectedStateId, sonataFilterIds } = storeToRefs(store)

const selectedEchoIdSet = computed(() => new Set(selectedEchoIds.value))
const currentSelectedCount = computed(() => candidateEchoes.value.filter(({ id }) => selectedEchoIdSet.value.has(id)).length)
const allCurrentSelected = computed(() => candidateEchoes.value.length > 0 && currentSelectedCount.value === candidateEchoes.value.length)
const someCurrentSelected = computed(() => currentSelectedCount.value > 0 && !allCurrentSelected.value)
const sonataOptions = computed(() => dataset.value?.sonatas.map(({ id, name, iconUrl }) => ({ value: id, label: name, iconUrl })) ?? [])
const costOptions = [{ value: 1, label: 'C1' }, { value: 3, label: 'C3' }] as const
const activeCostFilterSet = computed(() => new Set<EchoCostFilter>(echoCostFilters.value))

function toggleCostFilter(cost: EchoCostFilter): void {
  const next = new Set(activeCostFilterSet.value)
  if (next.has(cost)) next.delete(cost)
  else next.add(cost)
  const filters = costOptions.filter(({ value }) => next.has(value)).map(({ value }) => value)
  store.setEchoCostFilters(filters)
}

function setCurrentSelection(selected: boolean): void {
  if (selected) store.selectCandidateEchoes()
  else store.deselectCandidateEchoes()
}

const locationCountByEcho = computed(() => {
  const counts = new Map<string, number>()
  for (const location of allEchoLocations.value) {
    if (location.stateId === selectedStateId.value && matchesGravity(location.gravityType, supportsGravity.value ? selectedGravity.value : null)) {
      for (const { echoId } of echoMembers(location)) counts.set(echoId, (counts.get(echoId) ?? 0) + 1)
    }
  }
  return counts
})
</script>

<template>
  <div id="echo-filters" class="border-b border-[var(--line)] p-18px">
    <div class="mb-13px">
      <div>
        <span class="block text-12px min-[1024px]:text-8px text-[#608176] font-800 tracking-[0.18em]">声骸目标</span>
      </div>
    </div>
    <div class="mb-10px">
      <div class="min-w-0">
        <WuMultiSelect
          id="sonata-filter-select"
          :model-value="sonataFilterIds"
          :options="sonataOptions"
          label="合鸣套装"
          all-label="全部套装"
          search-placeholder="搜索合鸣套装"
          @update:model-value="store.setSonataFilters"
        />
      </div>
    </div>
    <div class="mb-10px flex h-44px w-full min-[1024px]:h-34px items-center gap-7px border border-[var(--line)] rounded-7px bg-[rgba(21,40,35,0.78)] px-10px text-[#6f887f] focus-within:border-[rgba(101,241,194,0.55)]">
      <WuSvg name="search" class="shrink-0 [--wu-svg-h:14px]" />
      <WuInput variant="plain" size="sm" :model-value="echoSearch" type="search" placeholder="搜索当前声骸列表" @update:model-value="store.setEchoSearch" />
    </div>
    <div class="mb-9px flex items-center justify-between gap-7px">
      <WuCheckBox
        class="flex shrink-0 items-center gap-6px text-12px min-[1024px]:text-9px text-[#8fa69d]"
        :model-value="allCurrentSelected"
        :indeterminate="someCurrentSelected"
        :disabled="candidateEchoes.length === 0"
        @update:model-value="setCurrentSelection"
      >{{ currentSelectedCount }} / {{ candidateEchoes.length }}</WuCheckBox>
      <div class="flex shrink-0 gap-5px">
        <button
          v-for="option in costOptions"
          :key="option.value"
          type="button"
          class="min-h-40px min-[1024px]:min-h-0 cursor-pointer rounded-5px border px-9px py-4px text-12px min-[1024px]:text-9px font-650 outline-none"
          :class="activeCostFilterSet.has(option.value)
            ? 'border-[rgba(101,241,194,0.5)] bg-[#244b39] text-[#eafff2]'
            : 'border-[var(--line)] bg-transparent text-[#91a99f] hover:border-[rgba(101,241,194,0.36)] hover:text-[#dce9e3]'"
          @click="toggleCostFilter(option.value)"
        >{{ option.label }}</button>
      </div>
    </div>
    <WuScrollArea
      class="h-290px"
      content-class="flex flex-col gap-4px pr-2px"
    >
      <div
        v-if="echoSearch.trim() !== '' && filteredEchoes.length === 0"
        class="h-290px flex items-center justify-center px-16px text-center text-12px text-[var(--muted)]"
      >未找到匹配的声骸</div>
      <button
        v-for="echo in filteredEchoes"
        :key="echo.id"
        class="grid min-h-48px w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_20px] items-center rounded-6px border px-8px py-4px pl-4px text-left font-inherit"
        :class="selectedEchoIds.includes(echo.id)
          ? 'border-[rgba(101,241,194,0.34)] bg-[rgba(34,65,55,0.66)]'
          : 'border-transparent bg-[rgba(25,43,38,0.48)] hover:border-[rgba(101,241,194,0.34)] hover:bg-[rgba(34,65,55,0.66)]'"
        type="button"
        @click="store.toggleEcho(echo.id)"
      >
        <img loading="lazy" decoding="async" class="h-38px w-38px object-contain" :src="echo.iconUrl" />
        <span class="flex overflow-hidden flex-col items-start gap-3px">
          <span class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-14px min-[1024px]:text-11px text-[#dce9e3] font-[560]">{{ echo.name }}</span>
          <span class="text-12px min-[1024px]:text-9px text-[#70877e]">COST {{ echo.cost }} · {{ locationCountByEcho.get(echo.id) ?? 0 }} 处</span>
        </span>
        <span class="text-center text-13px text-[var(--accent)]">{{ selectedEchoIds.includes(echo.id) ? '✓' : '+' }}</span>
      </button>
    </WuScrollArea>
  </div>
</template>
