<script setup lang="ts">
import { buttonClasses } from './base/button-styles.ts'
import WuButton from './base/WuButton.vue'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import WuScrollArea from './base/WuScrollArea.vue'
import WuSvg from './base/WuSvg.vue'
import { useExplorerStore } from '../stores/explorer.ts'
import EchoFilter from './filters/EchoFilter.vue'
import RoutePanel from './RoutePanel.vue'
import type { PointSourceFilter } from '../domain/types.ts'

defineProps<{ compact: boolean }>()
defineEmits<{ editRequested: [] }>()

const store = useExplorerStore()
const {
  dataset,
  pointSourceFilters,
  selectedEchoIds,
} = storeToRefs(store)
const pointSourceOptions = [
  { value: 'manual', label: '人工点位' },
  { value: 'official', label: '官方点位' },
] as const satisfies readonly { value: PointSourceFilter; label: string }[]
const activePointSourceFilterSet = computed(() => new Set(pointSourceFilters.value))
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
        <div class="flex flex-wrap items-center justify-between gap-10px">
          <div class="min-w-0 flex items-center gap-4px whitespace-nowrap">
            <WuButton variant="ghost" tone="accent" :size="compact ? 'lg' : 'xs'" @click="$emit('editRequested')">点位录入</WuButton>
            <RouterLink to="/assets" :class="buttonClasses({ variant: 'ghost', tone: 'accent', size: compact ? 'lg' : 'xs' })">资产浏览</RouterLink>
          </div>
          <div class="flex shrink-0 gap-5px">
            <WuButton v-for="option in pointSourceOptions" :key="option.value" :size="compact ? 'lg' : 'xs'" :tone="activePointSourceFilterSet.has(option.value) ? 'accent' : 'neutral'" @click="togglePointSourceFilter(option.value)">{{ option.label }}</WuButton>
          </div>
        </div>
      </div>
      <EchoFilter :compact="compact" />
      <RoutePanel />
    </WuScrollArea>
  </div>
</template>
