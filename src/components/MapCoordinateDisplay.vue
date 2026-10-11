<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <div class="h-[32px] max-w-full shrink-0 select-none overflow-hidden whitespace-nowrap rounded-[6px] outline -outline-offset-1 outline-[var(--line)] bg-[#07110fe6] px-[9px] py-[6px] font-mono text-[12px] text-[var(--muted)] tabular-nums shadow-lg">
    {{ text }}
  </div>
</template>
