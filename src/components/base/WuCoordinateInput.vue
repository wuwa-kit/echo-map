<script setup lang="ts">
import WuButton from './WuButton.vue'
import { computed, useTemplateRef } from 'vue'
import { coordinateAxes, coordinateInputXY, commitCoordinateInput, editCoordinateInput, parseCoordinateInteger, switchCoordinateInput } from './coordinate-input.ts'
import type { CoordinateAxis, CoordinateInputChange, CoordinateInputState, CoordinateValue } from './coordinate-input.ts'
import WuInput from './WuInput.vue'

const props = defineProps<{
  modelValue: CoordinateValue
  state: CoordinateInputState
  disabled?: boolean
  invalid?: boolean
  allowEmpty?: boolean
  confirmationHint?: string
}>()
const emit = defineEmits<{ changed: [change: CoordinateInputChange], confirmed: [coordinate: [number, number]], confirmationInterrupted: [] }>()
const container = useTemplateRef<HTMLElement>('containerRef')
defineExpose({ focus: () => container.value?.querySelector('input')?.focus() })
const combinedText = computed(() => props.state.text ?? (coordinateAxes.every((axis) => props.modelValue[axis] === null) ? '' : coordinateAxes.map((axis) => props.modelValue[axis] ?? '').join(', ')))
function axisText(axis: CoordinateAxis): string { return props.state.axes[axis] ?? String(props.modelValue[axis] ?? '') }
function edit(text: string, axis?: CoordinateAxis): void {
  if (props.disabled) return
  emit('confirmationInterrupted')
  emit('changed', editCoordinateInput(props.state, props.modelValue, text, axis, props.allowEmpty))
}
function commit(): void {
  if (!props.disabled) emit('changed', commitCoordinateInput(props.state, props.modelValue, props.allowEmpty))
}
function confirm(text: string, axis?: CoordinateAxis): void {
  if (props.disabled) return
  const edited = editCoordinateInput(props.state, props.modelValue, text, axis, props.allowEmpty)
  const coordinate = coordinateInputXY(edited.state, edited.value)
  emit('changed', commitCoordinateInput(edited.state, edited.value, props.allowEmpty))
  if (coordinate) emit('confirmed', coordinate)
}
function toggle(): void {
  emit('confirmationInterrupted')
  if (!props.disabled) emit('changed', switchCoordinateInput(props.state, props.modelValue, props.state.mode === 'combined' ? 'axes' : 'combined', props.allowEmpty))
}
function interruptKey(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.repeat || event.isComposing || event.keyCode === 229) emit('confirmationInterrupted')
}
function filterAxisInput(axis: CoordinateAxis, event: Event): void {
  const input = event.target
  if (input instanceof HTMLInputElement && !/^-?[0-9]*$/u.test(input.value)) input.value = axisText(axis)
}
</script>

<template>
  <div ref="containerRef" class="group min-w-0" @keydown="interruptKey" @focusout="emit('confirmationInterrupted')" @compositionstart="emit('confirmationInterrupted')">
    <div class="flex items-start gap-[6px]">
      <WuInput v-if="state.mode === 'combined'" class="min-w-0 flex-1 font-mono" :model-value="combinedText" placeholder="X, Y, Z" :disabled="disabled" :invalid="invalid || state.invalid" @update:model-value="edit($event)" @blur="commit" @confirm="confirm($event)" />
      <div v-else class="min-w-0 flex flex-1 gap-[6px]">
        <WuInput v-for="axis in coordinateAxes" :key="axis" class="min-w-0 flex-1 font-mono" :tooltip="axis.toUpperCase()" :placeholder="axis.toUpperCase()" inputmode="text" :model-value="axisText(axis)" :disabled="disabled" :invalid="invalid || (state.axisPending[axis] && parseCoordinateInteger(axisText(axis)) === null)" @input.capture="filterAxisInput(axis, $event)" @compositionend.capture="filterAxisInput(axis, $event)" @update:model-value="edit($event, axis)" @blur="commit" @confirm="confirm($event, axis)" />
      </div>
      <WuButton icon-only :icon="state.mode === 'combined' ? 'coordinate-axes' : 'coordinate-combined'" :tooltip="state.mode === 'combined' ? '切换为分轴输入' : '切换为整组输入'" :disabled="disabled" @click="toggle"></WuButton>
    </div>
    <div v-if="confirmationHint !== undefined || $slots.hint" class="mt-[4px] h-[18px] text-[12px] leading-[18px] text-[#91ae9e]">
      <slot name="hint">
        <span class="invisible group-has-[input:focus]:visible">{{ disabled ? '' : confirmationHint }}</span>
      </slot>
    </div>
  </div>
</template>
