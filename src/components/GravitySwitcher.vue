<script setup lang="ts">
import WuButton from './base/WuButton.vue'
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
  <WuButton v-if="supportsGravity" variant="solid" :size="compact ? 'lg' : 'md'" icon-position="end" class="shadow-lg" @click="toggleGravity">
    <template #icon>
      <WuSvg name="gravity-direction" :class="props.selectedGravity === 2 ? 'rotate-180' : ''" />
    </template>
    切换重力
  </WuButton>
</template>
