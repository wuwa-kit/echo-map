<script setup lang="ts">
import WuEllipsis from './WuEllipsis.vue'

defineProps<{ text: string; count?: number; selected?: boolean }>()
</script>

<template>
  <button type="button" class="relative flex h-[38px] w-full min-w-0 cursor-pointer items-center gap-[8px] rounded-[6px] px-[10px] text-left text-[12px]" :class="selected ? 'bg-[#25392e] text-[#b4e5cc]' : 'text-[#99a79f] hover:bg-white/5'">
    <slot name="prefix" />
    <WuEllipsis class="min-w-0 flex-1" :text="text" />
    <span v-if="count !== undefined" class="shrink-0 text-[11px] tabular-nums opacity-60">{{ count }}</span>
    <slot />
  </button>
</template>
