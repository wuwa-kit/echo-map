<script setup lang="ts">
import type { GravityType } from '../domain/types.ts'
import WuSvg from './base/WuSvg.vue'

const props = defineProps<{
  compact: boolean
  selectedGravity: GravityType
  supportsGravity: boolean
}>()
const emit = defineEmits<{
  gravitySelected: [value: GravityType]
}>()

function toggleGravity(): void {
  emit('gravitySelected', props.selectedGravity === 1 ? 2 : 1)
}
</script>

<template>
  <button
    v-if="supportsGravity"
    type="button"
    class="flex cursor-pointer select-none items-center gap-6px rounded-8px border border-[var(--line)] bg-[#07110fed] text-13px text-[#dcebe4] shadow-lg hover:bg-[#142a23]"
    :class="compact ? 'h-44px px-11px' : 'h-40px px-10px'"
    @click="toggleGravity"
  >
    <span>重力</span>
    <WuSvg
      name="gravity-direction"
      class="text-[var(--accent)] transition-transform duration-200 [--wu-svg-h:18px]"
      :class="props.selectedGravity === 2 ? 'rotate-180' : ''"
    />
  </button>
</template>
