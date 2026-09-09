<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../stores/explorer.ts'
import WuSvg from './base/WuSvg.vue'

defineProps<{ compact: boolean }>()

const store = useExplorerStore()
const { selectedGravity, supportsGravity } = storeToRefs(store)

function toggleGravity(): void {
  store.selectGravity(selectedGravity.value === 1 ? 2 : 1)
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
      :class="selectedGravity === 2 ? 'rotate-180' : ''"
    />
  </button>
</template>
