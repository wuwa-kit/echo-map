<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { buttonClasses } from './button-styles.ts'
import type { WuButtonSize, WuButtonTone, WuButtonVariant } from './button-styles.ts'
import WuSvg from './WuSvg.vue'
import { vTooltip } from './tooltip.ts'
import type { WuTooltipValue } from './tooltip.ts'

const props = withDefaults(defineProps<{
  type?: 'button' | 'submit' | 'reset'
  variant?: WuButtonVariant
  tone?: WuButtonTone
  size?: WuButtonSize
  icon?: string
  iconPosition?: 'start' | 'end'
  iconOnly?: boolean
  disabled?: boolean
  loading?: boolean
  tooltip?: WuTooltipValue
}>(), {
  type: 'button',
  variant: 'outline',
  tone: 'neutral',
  size: 'md',
  iconPosition: 'start',
  iconOnly: false,
  disabled: false,
  loading: false,
})
const emit = defineEmits<{ click: [event: MouseEvent] }>()
const slots = defineSlots<{ default?: () => unknown, icon?: () => unknown }>()
const element = useTemplateRef<HTMLButtonElement>('elementRef')

function onClick(event: MouseEvent): void {
  if (props.disabled || props.loading) {
    event.preventDefault()
    return
  }
  emit('click', event)
}

defineExpose({ element })
</script>

<template>
  <button v-tooltip="tooltip" ref="elementRef" :type="type" :disabled="disabled || loading" :class="buttonClasses(props)" @click="onClick">
    <span class="min-w-0 inline-grid place-items-center">
      <span
        class="min-w-0 inline-flex items-center justify-center gap-[var(--wu-button-gap)] [grid-area:1/1]"
        :class="[loading ? 'invisible' : '', iconPosition === 'end' ? 'flex-row-reverse' : '']"
      >
        <span v-if="icon || slots.icon" class="h-[var(--wu-button-icon-size)] w-[var(--wu-button-icon-size)] flex shrink-0 items-center justify-center [--wu-svg-h:var(--wu-button-icon-size)]">
          <slot name="icon"><WuSvg v-if="icon" :name="icon" /></slot>
        </span>
        <span v-if="!iconOnly" class="min-w-0"><slot /></span>
      </span>
      <WuSvg v-if="loading" name="loader" class="animate-spin [--wu-svg-h:var(--wu-button-icon-size)] [grid-area:1/1] motion-reduce:animate-none" />
    </span>
  </button>
</template>
