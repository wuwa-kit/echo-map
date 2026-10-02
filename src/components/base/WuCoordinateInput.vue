<script setup lang="ts">
import { computed } from 'vue'
import { coordinateAxes, commitCoordinateInput, editCoordinateInput, parseCoordinateInteger, switchCoordinateInput } from './coordinate-input.ts'
import type { CoordinateAxis, CoordinateInputChange, CoordinateInputState, CoordinateValue } from './coordinate-input.ts'
import WuInput from './WuInput.vue'
import WuSvg from './WuSvg.vue'

const props = defineProps<{
  modelValue: CoordinateValue
  state: CoordinateInputState
  disabled?: boolean
  invalid?: boolean
}>()
const emit = defineEmits<{ changed: [change: CoordinateInputChange] }>()
const combinedText = computed(() => props.state.text ?? (coordinateAxes.every((axis) => props.modelValue[axis] === null) ? '' : coordinateAxes.map((axis) => props.modelValue[axis] ?? '').join(', ')))
function axisText(axis: CoordinateAxis): string { return props.state.axes[axis] ?? String(props.modelValue[axis] ?? '') }
function edit(text: string, axis?: CoordinateAxis): void {
  if (props.disabled) return
  emit('changed', editCoordinateInput(props.state, props.modelValue, text, axis))
}
function commit(): void {
  if (!props.disabled) emit('changed', commitCoordinateInput(props.state, props.modelValue))
}
function toggle(): void {
  if (!props.disabled) emit('changed', switchCoordinateInput(props.state, props.modelValue, props.state.mode === 'combined' ? 'axes' : 'combined'))
}
function filterAxisInput(axis: CoordinateAxis, event: Event): void {
  const input = event.target
  if (input instanceof HTMLInputElement && !/^-?[0-9]*$/u.test(input.value)) input.value = axisText(axis)
}
</script>

<template>
  <div class="flex items-start gap-6px">
    <WuInput v-if="state.mode === 'combined'" class="min-w-0 flex-1 font-mono" :model-value="combinedText" placeholder="X, Y, Z" :disabled="disabled" :invalid="invalid || state.invalid" @update:model-value="edit($event)" @blur="commit" @confirm="commit" />
    <div v-else class="min-w-0 flex flex-1 gap-6px">
      <WuInput v-for="axis in coordinateAxes" :key="axis" class="min-w-0 flex-1 font-mono" :title="axis.toUpperCase()" :placeholder="axis.toUpperCase()" inputmode="text" :model-value="axisText(axis)" :disabled="disabled" :invalid="invalid || (state.axisPending[axis] && parseCoordinateInteger(axisText(axis)) === null)" @input.capture="filterAxisInput(axis, $event)" @compositionend.capture="filterAxisInput(axis, $event)" @update:model-value="edit($event, axis)" @blur="commit" @confirm="commit" />
    </div>
    <button type="button" class="h-40px w-34px flex shrink-0 items-center justify-center rounded-7px border border-[var(--line)] bg-[#12271f] text-20px text-[#9cceba] disabled:opacity-40" :title="state.mode === 'combined' ? '切换为分轴输入' : '切换为整组输入'" :disabled="disabled" @click="toggle">
      <WuSvg :name="state.mode === 'combined' ? 'coordinate-axes' : 'coordinate-combined'" />
    </button>
  </div>
</template>
