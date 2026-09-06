<script setup lang="ts">
import { createInputEvents } from './input-events.ts'

const props = withDefaults(defineProps<{
  modelValue: string | number | null
  type?: 'text' | 'search' | 'number' | 'email' | 'password' | 'tel' | 'url'
  size?: 'sm' | 'md'
  variant?: 'outline' | 'plain'
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
  /** Commit on change or Enter; reflect the value accepted by the owner. */
  lazy?: boolean
}>(), {
  type: 'text',
  size: 'md',
  variant: 'outline',
  disabled: false,
  readonly: false,
  invalid: false,
  lazy: false,
})

const emit = defineEmits<{
  // Preserve raw text, including empty values; domain actions own numeric conversion.
  'update:modelValue': [value: string]
  confirm: [value: string]
}>()
const events = createInputEvents(props, {
  update: (value) => emit('update:modelValue', value),
  confirm: (value) => emit('confirm', value),
})
</script>

<template>
  <input
    :type="type"
    :value="modelValue ?? ''"
    :disabled="disabled"
    :readonly="readonly"
    :aria-invalid="invalid || undefined"
    class="block w-full min-w-0 text-16px text-[#e1f0e8] font-inherit outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#6f887f] disabled:cursor-not-allowed disabled:opacity-50"
    :class="[
      variant === 'plain' ? 'h-full border-0 bg-transparent p-0' : 'rounded-7px border bg-[#12271f]',
      variant === 'outline' ? (size === 'sm' ? 'h-36px px-6px' : 'min-h-40px px-10px') : '',
      size === 'sm' ? 'lg:text-13px' : 'lg:text-14px',
      invalid
        ? 'border-[#ff8d7e] focus-visible:border-[#ffad9f] focus-visible:shadow-[0_0_0_2px_rgba(255,141,126,0.13)]'
        : 'border-[var(--line)] focus-visible:border-[var(--accent)]',
    ]"
    @input="events.input"
    @change="events.change"
    @compositionstart="events.compositionStart"
    @compositionend="events.compositionEnd"
    @keydown="events.keydown"
  />
</template>
