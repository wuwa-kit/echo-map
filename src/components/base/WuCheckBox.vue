<script setup lang="ts">
import WuSvg from './WuSvg.vue'

const props = withDefaults(defineProps<{
  disabled?: boolean
  indeterminate?: boolean
}>(), {
  disabled: false,
  indeterminate: false,
})

const model = defineModel<boolean>({ required: true })

function toggle(): void {
  if (props.disabled) {
    return
  }
  model.value = !model.value
}
</script>

<template>
  <div
    class="relative"
    :class="props.disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'"
    @click="toggle"
  >
    <span
      class="pointer-events-none grid h-14px w-14px shrink-0 place-items-center border rounded-4px transition-[border-color,background-color,box-shadow] duration-150"
      :class="model || props.indeterminate
        ? 'border-[rgba(101,241,194,0.72)] bg-[var(--accent)] text-[#0b211a] shadow-[0_0_8px_rgba(101,241,194,0.18)]'
        : props.disabled
          ? 'border-[rgba(169,207,192,0.1)] bg-[rgba(12,25,21,0.72)] text-transparent'
          : 'border-[rgba(169,207,192,0.36)] bg-[rgba(13,29,24,0.92)] text-transparent'"
    >
      <span v-if="props.indeterminate" class="h-2px w-8px rounded-full bg-current" />
      <WuSvg v-else name="check" class="[--wu-svg-h:10px] [--wu-svg-w:10px]" />
    </span>
    <slot />
  </div>
</template>
