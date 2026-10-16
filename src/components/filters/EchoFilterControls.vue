<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue'
import { useEchoSearchHistoryStore } from '../../stores/echo-search-history.ts'
import type { SonataEffect } from '../../domain/types.ts'
import WuMultiSelect from '../base/WuMultiSelect.vue'
import WuSearchInput from '../base/WuSearchInput.vue'
import WuSvg from '../base/WuSvg.vue'
import WuButton from '../base/WuButton.vue'
import WuPopover from '../base/WuPopover.vue'

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
const history = useEchoSearchHistoryStore()
const searchAnchor = useTemplateRef<HTMLDivElement>('searchAnchorRef')
const historyPopover = useTemplateRef<InstanceType<typeof WuPopover>>('historyPopoverRef')
onMounted(history.restore)

function useHistory(value: string): void {
  history.record(value)
  emit('searchChanged', value)
  historyPopover.value?.hide()
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  event.stopPropagation()
  historyPopover.value?.hide()
}

function toggleCost(cost: 1 | 3): void {
  emit('costsChanged', costs.filter((value) => value === cost ? !props.costs.includes(value) : props.costs.includes(value)))
}
</script>

<template>
  <div class="mb-[10px]">
    <WuMultiSelect control-height-class="h-[44px] min-[1024px]:h-[34px]" :model-value="sonataIds" :options="options" label="合鸣套装" all-label="全部套装" search-placeholder="搜索合鸣套装" @update:model-value="emit('sonatasChanged', [...$event])" />
  </div>
  <div ref="searchAnchorRef" class="mb-[10px] flex h-[44px] w-full min-[1024px]:h-[34px] items-center gap-[7px] outline -outline-offset-1 outline-[var(--line)] rounded-[7px] bg-[rgba(21,40,35,0.78)] px-[10px] text-[#6f887f] focus-within:outline-[rgba(101,241,194,0.55)]" @focusin="historyPopover?.show()" @click="historyPopover?.show()">
    <WuSvg name="search" class="shrink-0 [--wu-svg-h:14px]" />
    <WuSearchInput variant="plain" size="sm" :model-value="search" placeholder="搜索声骸 / C1、C3" @update:model-value="emit('searchChanged', $event)" @keydown="onSearchKeydown" />
  </div>
  <WuPopover ref="historyPopoverRef" :anchor="searchAnchor" :disabled="history.entries.length === 0" placement="top-start" width="trigger" :max-height="240" :gap="6" class="rounded-[8px] outline -outline-offset-1 outline-[var(--line)] bg-[#12271f] shadow-xl">
    <div class="min-h-0 overflow-y-auto p-[10px]">
      <div class="flex flex-wrap gap-[6px]">
        <div v-for="entry in history.entries" :key="entry" class="flex max-w-full items-center rounded-[5px] outline -outline-offset-1 outline-[var(--line)] bg-[#1b352a] text-[12px] text-[#dce9e3]">
          <button type="button" class="min-w-0 cursor-pointer break-all rounded-l-[5px] px-[8px] py-[5px] text-left hover:bg-[#264b3c]" @click="useHistory(entry)">{{ entry }}</button>
          <button type="button" class="shrink-0 cursor-pointer rounded-r-[5px] px-[6px] py-[7px] text-[var(--muted)] hover:bg-[#264b3c] hover:text-[#ff8d7e]" @click="history.remove(entry)">
            <WuSvg name="close" class="[--wu-svg-h:12px] [--wu-svg-w:12px]" />
          </button>
        </div>
      </div>
    </div>
  </WuPopover>
  <div class="mb-[9px] flex items-center justify-between gap-[7px]">
    <div><slot /></div>
    <div class="flex shrink-0 gap-[5px]">
      <WuButton v-for="cost in costs" :key="cost" :size="compact ? 'lg' : 'xs'" :variant="props.costs.includes(cost) ? 'solid' : 'outline'" :tone="props.costs.includes(cost) ? 'accent' : 'neutral'" @click="toggleCost(cost)">C{{ cost }}</WuButton>
    </div>
  </div>
</template>
