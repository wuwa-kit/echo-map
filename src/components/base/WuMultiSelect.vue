<script setup lang="ts">
import { computed, shallowRef, useAttrs, useId, useTemplateRef } from 'vue'
import WuCheckBox from './WuCheckBox.vue'
import WuInput from './WuInput.vue'
import WuOverflowRow from './WuOverflowRow.vue'
import WuPopover from './WuPopover.vue'
import WuScrollArea from './WuScrollArea.vue'
import WuSvg from './WuSvg.vue'

defineOptions({ inheritAttrs: false })

export interface WuMultiSelectOption {
  value: string
  label: string
  iconUrl?: string
}

const props = withDefaults(defineProps<{
  options: readonly WuMultiSelectOption[]
  label: string
  allLabel?: string
  searchPlaceholder?: string
  disabled?: boolean
}>(), {
  allLabel: '全部',
  disabled: false,
})
const model = defineModel<readonly string[]>({ required: true })
const attrs = useAttrs()
const componentId = useId()
const popoverId = `wu-multi-select-popover-${componentId}`
const trigger = useTemplateRef<HTMLButtonElement>('triggerRef')
const popover = useTemplateRef<InstanceType<typeof WuPopover>>('popoverRef')
const isOpen = shallowRef(false)
const searchQuery = shallowRef('')
const selectedSet = computed(() => new Set(model.value))
const selectedOptions = computed(() => props.options.filter(({ value }) => selectedSet.value.has(value)))
const filteredOptions = computed(() => {
  const search = searchQuery.value.trim().toLocaleLowerCase()
  if (search === '') return props.options
  return props.options.filter(({ label }) => label.toLocaleLowerCase().includes(search))
})
const currentSelectedCount = computed(() => filteredOptions.value.filter(({ value }) => selectedSet.value.has(value)).length)
const allCurrentSelected = computed(() => filteredOptions.value.length > 0 && currentSelectedCount.value === filteredOptions.value.length)
const someCurrentSelected = computed(() => currentSelectedCount.value > 0 && !allCurrentSelected.value)

function clear(): void {
  model.value = []
}

function clearSearch(): void {
  searchQuery.value = ''
}

function setCurrentSelection(selected: boolean): void {
  const next = new Set(model.value)
  for (const { value } of filteredOptions.value) {
    if (selected) next.add(value)
    else next.delete(value)
  }
  model.value = props.options.filter(({ value }) => next.has(value)).map(({ value }) => value)
}

function toggle(value: string): void {
  const next = new Set(model.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  model.value = props.options.filter((option) => next.has(option.value)).map(({ value: optionValue }) => optionValue)
}

function onOpened(): void {
  isOpen.value = true
}

function onClosed(): void {
  isOpen.value = false
  clearSearch()
}

</script>

<template>
  <div class="relative min-w-0">
    <button
      v-bind="attrs"
      ref="triggerRef"
      type="button"
      :disabled="disabled"
      :popovertarget="popoverId"
      class="h-40px w-full min-w-0 flex cursor-pointer items-center justify-between gap-7px rounded-7px border border-[var(--line)] bg-[#152b24] px-10px text-left text-12px text-[#dce9e3] font-inherit outline-none hover:border-[rgba(101,241,194,0.36)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span v-if="selectedOptions.length === 0" class="min-w-0 truncate">{{ allLabel }}</span>
      <span v-else-if="selectedOptions.length === 1" class="min-w-0 flex items-center gap-7px">
        <img v-if="selectedOptions[0]?.iconUrl" class="h-20px w-20px shrink-0 object-contain" :src="selectedOptions[0].iconUrl" />
        <span class="min-w-0 truncate">{{ selectedOptions[0]?.label }}</span>
      </span>
      <WuOverflowRow
        v-else
        class="min-w-0 flex-1"
        :gap="5"
        :item-gap="3"
        :items="selectedOptions"
      >
        <template #item="{ item: option }">
          <img class="h-20px w-20px object-contain" :src="option.iconUrl" />
        </template>
        <template #suffix="{ hiddenCount }">
          <span v-if="hiddenCount > 0" class="text-[#91ab9d]">+{{ hiddenCount }}</span>
        </template>
      </WuOverflowRow>
      <WuSvg name="chevron-down" class="shrink-0 text-[#78998d] [--wu-svg-h:14px]" :class="isOpen ? 'rotate-180 text-[var(--accent)]' : ''" />
    </button>
    <WuPopover
      :id="popoverId"
      ref="popoverRef"
      :anchor="trigger"
      :disabled="disabled"
      width="trigger"
      :max-height="320"
      :gap="6"
      class="border border-[rgba(169,207,192,0.18)] rounded-9px bg-[rgba(8,20,17,0.98)] p-4px text-[#dce9e3] shadow-[0_18px_48px_rgba(0,0,0,0.42)] [&:popover-open]:overflow-visible"
      @opened="onOpened"
      @closed="onClosed"
    >
      <div v-if="searchPlaceholder" class="absolute bottom-[calc(100%+6px)] left-0 h-40px w-full min-w-0 flex box-border items-center gap-7px rounded-7px border border-[rgba(101,241,194,0.55)] bg-[#152b24] px-10px text-12px text-[#dce9e3] shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
        <WuSvg name="search" class="shrink-0 text-[#6f887f] [--wu-svg-h:14px]" />
        <WuInput v-model="searchQuery" class="flex-1" variant="plain" size="sm" type="text" :placeholder="searchPlaceholder" />
        <button v-if="searchQuery" type="button" class="h-24px w-24px shrink-0 cursor-pointer border-0 rounded-4px bg-transparent p-0 text-16px text-[#91ab9d] hover:bg-[#1c372b] hover:text-[#dce9e3]" @click="clearSearch">×</button>
        <button type="button" class="h-24px w-24px shrink-0 flex cursor-pointer items-center justify-center border-0 rounded-4px bg-transparent p-0 text-[var(--accent)]" @click="popover?.hide()">
          <WuSvg name="chevron-down" class="rotate-180 [--wu-svg-h:14px]" />
        </button>
      </div>
      <div class="min-h-40px flex items-center justify-between gap-8px border-b border-[var(--line)] px-8px py-5px">
        <WuCheckBox
          class="flex shrink-0 items-center gap-6px text-11px text-[#8fa69d]"
          :model-value="allCurrentSelected"
          :indeterminate="someCurrentSelected"
          :disabled="filteredOptions.length === 0"
          @update:model-value="setCurrentSelection"
        >{{ currentSelectedCount }} / {{ filteredOptions.length }}</WuCheckBox>
        <WuOverflowRow
          v-if="selectedOptions.length > 0"
          align="end"
          class="min-w-0 flex-1"
          :gap="5"
          :item-gap="3"
          :items="selectedOptions"
        >
          <template #item="{ item: option }">
            <img class="h-20px w-20px object-contain" :src="option.iconUrl" />
          </template>
          <template #suffix="{ hiddenCount }">
            <span v-if="hiddenCount > 0" class="text-11px text-[#91ab9d]">+{{ hiddenCount }}</span>
          </template>
        </WuOverflowRow>
      </div>
      <WuScrollArea size="sm">
        <div class="flex flex-col gap-3px p-4px">
          <div v-if="filteredOptions.length === 0" class="px-8px py-18px text-center text-12px text-[#789087]">没有匹配的{{ label }}</div>
          <button
            v-for="option in filteredOptions"
            :key="option.value"
            type="button"
            class="min-h-40px w-full min-w-0 flex cursor-pointer items-center justify-between gap-8px border-0 rounded-6px px-8px text-left text-12px font-inherit"
            :class="selectedSet.has(option.value) ? 'bg-[#244b39] text-[#eafff2]' : 'bg-transparent text-[#dce9e3] hover:bg-[#1c372b]'"
            @click="toggle(option.value)"
          >
            <span class="min-w-0 flex items-center gap-8px">
              <img v-if="option.iconUrl" loading="lazy" decoding="async" class="h-24px w-24px shrink-0 object-contain" :src="option.iconUrl" />
              <span class="min-w-0 truncate">{{ option.label }}</span>
            </span>
            <WuSvg v-if="selectedSet.has(option.value)" name="check" class="shrink-0 text-[var(--accent)] [--wu-svg-h:12px]" />
          </button>
        </div>
      </WuScrollArea>
    </WuPopover>
  </div>
</template>
