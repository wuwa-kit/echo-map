<script setup lang="ts">
import WuScrollArea from './WuScrollArea.vue'
</script>

<template>
  <div class="relative flex w-[180px] shrink-0 flex-col bg-[#141c18]">
    <div class="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/5" />
    <WuScrollArea class="min-h-0 flex-1" content-class="space-y-[3px] p-[10px]"><slot /></WuScrollArea>
    <div v-if="$slots.footer" class="shrink-0 space-y-[8px] p-[12px]"><slot name="footer" /></div>
  </div>
</template>
