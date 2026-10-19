<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  active: boolean
  count: number | null
  iconUrl: string
  name: string
}>()

const countLabel = computed(() => props.count === null ? '数量未知' : `× ${props.count}`)
</script>

<template>
  <div class="min-w-0 flex items-center gap-[6px] rounded-[8px] bg-[#10241c] p-[6px]" :class="active ? 'text-[#71ecc0]' : 'text-[#c9e1d6]'">
    <div class="h-[32px] w-[32px] shrink-0 flex items-center justify-center overflow-hidden rounded-[6px] bg-[#0a1712]">
      <img v-if="iconUrl" :src="iconUrl" class="h-[30px] w-[30px] object-contain" loading="lazy" />
      <span v-else class="text-[18px] text-[#688679]">?</span>
    </div>
    <div class="min-w-0 flex-1">
      <div class="text-[12px] leading-[18px] wrap-anywhere">{{ name }}</div>
      <div class="font-mono text-[10px] leading-[16px] tabular-nums text-[#9fc2b2]">{{ countLabel }}</div>
    </div>
  </div>
</template>
