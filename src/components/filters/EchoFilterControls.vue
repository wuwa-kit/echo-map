<script setup lang="ts">
import { computed } from 'vue'
import type { SonataEffect } from '../../domain/types.ts'
import WuMultiSelect from '../base/WuMultiSelect.vue'
import WuSearchInput from '../base/WuSearchInput.vue'
import WuSvg from '../base/WuSvg.vue'
import WuButton from '../base/WuButton.vue'

const props = defineProps<{
  sonatas: readonly SonataEffect[]
  sonataIds: readonly string[]
  costs: readonly (1 | 3)[]
  search: string
  compact?: boolean
}>()
const emit = defineEmits<{
  sonatasChanged: [ids: string[]]
  costsChanged: [costs: (1 | 3)[]]
  searchChanged: [search: string]
}>()
const options = computed(() => props.sonatas.map(({ id, name, iconUrl }) => ({ value: id, label: name, iconUrl })))
const costs = [1, 3] as const
function toggleCost(cost: 1 | 3): void {
  emit('costsChanged', costs.filter((value) => value === cost ? !props.costs.includes(value) : props.costs.includes(value)))
}
</script>

<template>
  <div class="mb-[10px]">
    <WuMultiSelect control-height-class="h-[44px] min-[1024px]:h-[34px]" :model-value="sonataIds" :options="options" label="合鸣套装" all-label="全部套装" search-placeholder="搜索合鸣套装" @update:model-value="emit('sonatasChanged', [...$event])" />
  </div>
  <div class="mb-[10px] flex h-[44px] w-full min-[1024px]:h-[34px] items-center gap-[7px] outline -outline-offset-1 outline-[var(--line)] rounded-[7px] bg-[rgba(21,40,35,0.78)] px-[10px] text-[#6f887f] focus-within:outline-[rgba(101,241,194,0.55)]">
    <WuSvg name="search" class="shrink-0 [--wu-svg-h:14px]" />
    <WuSearchInput variant="plain" size="sm" :model-value="search" placeholder="搜索声骸 / C1、C3" @update:model-value="emit('searchChanged', $event)" />
  </div>
  <div class="mb-[9px] flex items-center justify-between gap-[7px]">
    <div><slot /></div>
    <div class="flex shrink-0 gap-[5px]">
      <WuButton v-for="cost in costs" :key="cost" :size="compact ? 'lg' : 'xs'" :variant="props.costs.includes(cost) ? 'solid' : 'outline'" :tone="props.costs.includes(cost) ? 'accent' : 'neutral'" @click="toggleCost(cost)">C{{ cost }}</WuButton>
    </div>
  </div>
</template>
