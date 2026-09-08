<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUpdated, useId, useTemplateRef } from 'vue'
import { useWuSelectContext } from './select-context.ts'
import type { WuSelectOptionRecord, WuSelectValue } from './select-context.ts'

const props = withDefaults(defineProps<{
  disabled?: boolean
  value: WuSelectValue
}>(), {
  disabled: false,
})

const context = useWuSelectContext()
const optionId = `wu-select-option-${useId()}`
const actualElement = useTemplateRef<HTMLDivElement>('actualElementRef')
const isSelected = computed(() => context.isSelectedValue(props.value))

function readOption(): WuSelectOptionRecord {
  return {
    id: optionId,
    value: props.value,
    label: actualElement.value?.textContent?.trim() ?? '',
    disabled: props.disabled,
  }
}

function updateOption(): void {
  context.updateOption(readOption())
}

function chooseOption(): void {
  context.chooseOption(readOption())
}

onMounted(() => {
  context.registerOption(readOption())
})

onUpdated(updateOption)

onBeforeUnmount(() => {
  context.unregisterOption(optionId)
})
</script>

<template>
  <div
    ref="actualElementRef"
    :class="[
      isSelected ? 'bg-[rgba(101,241,194,0.14)] text-[#8ff7d2]' : '',
      disabled
        ? 'cursor-not-allowed text-[#60746d] opacity-55'
        : 'cursor-pointer hover:bg-[rgba(101,241,194,0.09)]',
    ]"
    class="min-h-34px w-full flex items-center justify-between gap-10px rounded-5px bg-transparent px-9px py-7px text-left text-11px text-[#dce9e3] font-inherit transition-[color,background-color] duration-120"
    @click="chooseOption"
  >
    <span class="min-w-0 truncate"><slot /></span>
    <span
      v-if="isSelected"
      class="h-5px w-5px shrink-0 rounded-full bg-[var(--accent)] shadow-[0_0_7px_rgba(101,241,194,0.55)]"
    />
  </div>
</template>
