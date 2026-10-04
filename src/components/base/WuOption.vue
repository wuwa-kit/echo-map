<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUpdated, useId, useTemplateRef } from 'vue'
import { useWuSelectContext } from './select-context.ts'
import type { WuSelectOptionRecord, WuSelectValue } from './select-context.ts'
import WuSvg from './WuSvg.vue'

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
      isSelected
        ? 'text-[#eafff2] font-semibold'
        : disabled ? 'text-[#60746d]' : 'text-[#dce9e3]',
      disabled
        ? 'cursor-not-allowed opacity-55'
        : 'cursor-pointer hover:bg-[#1c372b]',
    ]"
    class="min-h-[34px] w-full flex items-center justify-between gap-[10px] rounded-[5px] bg-transparent px-[9px] py-[7px] text-left text-[11px] [font-family:inherit] transition-[color,background-color] duration-120"
    @click="chooseOption"
  >
    <span class="min-w-0 truncate"><slot /></span>
    <span class="h-[16px] w-[16px] shrink-0">
      <WuSvg v-if="isSelected" name="check" class="text-[var(--accent)] [--wu-svg-h:16px]" />
    </span>
  </div>
</template>
