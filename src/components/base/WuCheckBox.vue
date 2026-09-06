<script setup lang="ts">
import WuSvg from './WuSvg.vue'

const props = withDefaults(defineProps<{
  disabled?: boolean
  label?: string
}>(), {
  disabled: false,
  label: undefined,
})

const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label
    class="relative"
    :class="props.disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'"
  >
    <input
      v-model="model"
      class="peer sr-only"
      type="checkbox"
      :disabled="props.disabled"
      :aria-label="props.label"
    />
    <span
      class="pointer-events-none grid h-14px w-14px shrink-0 place-items-center border rounded-4px transition-[border-color,background-color,box-shadow] duration-150 peer-focus-visible:border-[rgba(101,241,194,0.9)] peer-focus-visible:shadow-[0_0_0_2px_rgba(101,241,194,0.16)] peer-disabled:border-[rgba(169,207,192,0.1)] peer-disabled:bg-[rgba(12,25,21,0.72)]"
      :class="model
        ? 'border-[rgba(101,241,194,0.72)] bg-[var(--accent)] text-[#0b211a] shadow-[0_0_8px_rgba(101,241,194,0.18)]'
        : 'border-[rgba(169,207,192,0.36)] bg-[rgba(13,29,24,0.92)] text-transparent'"
      aria-hidden="true"
    >
      <WuSvg name="check" class="[--wu-svg-h:10px] [--wu-svg-w:10px]" />
    </span>
    <slot />
  </label>
</template>
