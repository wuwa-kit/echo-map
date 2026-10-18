<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { buttonClasses } from './base/button-styles.ts'
import WuSvg from './base/WuSvg.vue'

defineProps<{ title: string }>()
</script>

<template>
  <div class="relative z-10 flex h-[56px] shrink-0 items-center gap-[16px] bg-[#0c1915] px-[20px] text-[#eaf4ef]">
    <RouterLink to="/" :class="buttonClasses({ variant: 'ghost', size: 'sm' })" class="shrink-0">
      <WuSvg name="chevron-left" class="[--wu-svg-h:var(--wu-button-icon-size)]" />返回地图
    </RouterLink>
    <span class="shrink-0 text-[15px] font-semibold">{{ title }}</span>
    <div v-if="$slots.default" class="ml-auto flex min-w-0 items-center overflow-x-auto"><slot /></div>
    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--line)]" />
  </div>
</template>
