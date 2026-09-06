<script setup lang="ts">
import { shallowRef } from 'vue'

defineProps<{ src: string; name: string; large?: boolean }>()
// This component is keyed by URL by its callers; image status is local DOM state.
const failed = shallowRef(false)
const loaded = shallowRef(false)
</script>

<template>
  <div class="relative flex items-center justify-center overflow-hidden bg-[#12221f]">
    <span v-if="!loaded || failed" class="absolute text-11px text-[#8fa69d]">{{ failed ? '预览暂不可用' : '加载预览…' }}</span>
    <img v-if="!failed" :src="src" :alt="name" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="relative h-full w-full object-contain" :class="large ? 'p-12px' : 'p-8px'" @load="loaded = true" @error="failed = true">
  </div>
</template>
