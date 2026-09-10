<script setup lang="ts">
import { computed } from 'vue'
import type { EchoDefinition } from '../domain/types.ts'

const props = defineProps<{
  active: boolean
  cost: EchoDefinition['cost'] | null
  count: number | null
  iconUrl: string
  name: string
}>()

const costLabel = computed(() => props.cost === null ? 'C?' : `C${props.cost}`)
const countLabel = computed(() => props.count === null ? '数量待核验' : `${props.count}只`)
</script>

<template>
  <div class="flex items-center gap-10px rounded-8px border bg-[#10241c] p-8px" :class="active ? 'border-[#3c866c] text-[#71ecc0]' : 'border-[var(--line)] text-[#c9e1d6]'">
    <div class="h-42px w-42px shrink-0 flex items-center justify-center overflow-hidden rounded-8px bg-[#0a1712]">
      <img v-if="iconUrl" :src="iconUrl" class="h-38px w-38px object-contain" loading="lazy" />
      <span v-else class="text-18px text-[#688679]">?</span>
    </div>
    <span class="min-w-0 flex-1 truncate">{{ name }}</span>
    <span class="shrink-0 font-mono text-12px tabular-nums text-[#9fc2b2]">{{ costLabel }} · {{ countLabel }}</span>
  </div>
</template>
