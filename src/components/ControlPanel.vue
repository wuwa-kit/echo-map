<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import WuScrollArea from './base/WuScrollArea.vue'
import WuSvg from './base/WuSvg.vue'
import { useExplorerStore } from '../stores/explorer.ts'
import EchoFilter from './filters/EchoFilter.vue'
import RoutePanel from './RoutePanel.vue'
import type { PointSourceFilter } from '../domain/types.ts'
import { createPointEditorQueryValues } from '../url/explorer-url.ts'

defineProps<{ compact: boolean }>()

const store = useExplorerStore()
const {
  compactFloors,
  dataset,
  mapViewport,
  pointSourceFilters,
  selectedCountryId,
  selectedEchoIds,
  selectedGravity,
  selectedLevelId,
  selectedStateId,
} = storeToRefs(store)
const pointSourceOptions = [
  { value: 'manual', label: '人工点位' },
  { value: 'official', label: '官方点位' },
] as const satisfies readonly { value: PointSourceFilter; label: string }[]
const activePointSourceFilterSet = computed(() => new Set(pointSourceFilters.value))
const editorRoute = computed(() => ({
  path: '/editor',
  query: createPointEditorQueryValues({
    stateId: selectedStateId.value,
    countryId: selectedCountryId.value,
    levelId: selectedLevelId.value,
    compactFloors: compactFloors.value,
    gravityType: store.supportsGravity ? selectedGravity.value : null,
    pointSourceFilters: pointSourceFilters.value,
    selectedEchoIds: selectedEchoIds.value,
    viewport: mapViewport.value,
  }),
}))

function togglePointSourceFilter(source: PointSourceFilter): void {
  const next = new Set(activePointSourceFilterSet.value)
  if (next.has(source)) next.delete(source)
  else next.add(source)
  store.setPointSourceFilters(pointSourceOptions
    .filter(({ value }) => next.has(value))
    .map(({ value }) => value))
}

</script>

<template>
  <div class="min-h-0 flex flex-1 flex-col">
    <WuScrollArea class="min-h-0 flex-1" content-class="pb-16px">
      <div v-if="dataset && !compact" class="border-b border-[var(--line)] p-18px">
        <div class="flex items-center justify-between gap-12px">
          <div class="flex min-w-0 items-center gap-11px">
            <WuSvg name="brand" class="shrink-0 text-[var(--accent)] [--wu-svg-h:34px]" />
            <div class="min-w-0 leading-none">
              <span class="block font-serif text-21px text-[#f1faf5] font-500 tracking-[0.12em]">声巡</span>
              <span class="mt-6px block truncate text-7px text-[#789087] font-700 tracking-[0.15em]">WUTHERING ECHO ROUTE</span>
            </div>
          </div>
          <span
            class="shrink-0 text-right text-12px min-[1024px]:text-8px text-[#71877e] leading-[1.45]"
            :data-datetime="dataset.source.generatedAt"
          >
            <span class="block">数据</span>
            <span class="block">{{ new Date(dataset.source.generatedAt).toLocaleDateString('zh-CN') }}</span>
          </span>
        </div>
      </div>

      <div class="border-b border-[var(--line)] p-16px">
        <div class="flex items-center justify-between gap-10px">
          <div class="min-w-0 flex items-center gap-12px whitespace-nowrap">
            <RouterLink :to="editorRoute" class="inline-flex min-h-40px min-[1024px]:min-h-0 items-center text-12px min-[1024px]:text-9px text-[var(--accent)] hover:text-[#b9ffe7]">点位录入</RouterLink>
            <RouterLink to="/assets" class="inline-flex min-h-40px min-[1024px]:min-h-0 items-center text-12px min-[1024px]:text-9px text-[var(--accent)] hover:text-[#b9ffe7]">资产浏览</RouterLink>
          </div>
          <div class="flex shrink-0 gap-5px">
            <button
              v-for="option in pointSourceOptions"
              :key="option.value"
              type="button"
              class="min-h-40px min-[1024px]:min-h-0 cursor-pointer rounded-5px border px-9px py-4px text-12px min-[1024px]:text-9px font-650 outline-none"
              :class="activePointSourceFilterSet.has(option.value)
                ? 'border-[rgba(101,241,194,0.5)] bg-[#244b39] text-[#eafff2]'
                : 'border-[var(--line)] bg-transparent text-[#91a99f] hover:border-[rgba(101,241,194,0.36)] hover:text-[#dce9e3]'"
              @click="togglePointSourceFilter(option.value)"
            >{{ option.label }}</button>
          </div>
        </div>
      </div>
      <EchoFilter :compact="compact" />
      <RoutePanel />
    </WuScrollArea>
  </div>
</template>
