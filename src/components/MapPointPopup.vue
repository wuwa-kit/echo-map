<script setup lang="ts">
import WuButton from './base/WuButton.vue'
withDefaults(defineProps<{
  showBack?: boolean
}>(), {
  showBack: false,
})

defineEmits<{
  back: []
  close: []
}>()
</script>

<template>
  <div class="absolute left-[12px] top-[64px] z-70 max-h-[55%] w-[min(340px,calc(100%_-_24px))] flex flex-col overflow-hidden rounded-[12px] border border-[var(--line)] bg-[#0b1b16f5] text-[14px] shadow-xl">
    <div class="min-h-[52px] shrink-0 flex items-center gap-[8px] border-b border-[var(--line)] px-[12px] py-[10px]">
      <WuButton v-if="showBack" size="sm" icon="chevron-left" icon-only tooltip="返回" @click="$emit('back')"></WuButton>
      <div class="min-w-0 flex-1 text-[#e7f4ee]">
        <slot name="title" />
      </div>
      <WuButton variant="ghost" size="sm" icon="close" icon-only tooltip="关闭" @click="$emit('close')"></WuButton>
    </div>
    <div class="min-h-0 flex flex-1 flex-col overflow-hidden">
      <slot />
    </div>
  </div>
</template>
