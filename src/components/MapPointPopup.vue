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
  <div class="min-h-0 flex flex-1 flex-col overflow-hidden text-[14px]">
    <div class="min-h-[52px] shrink-0 flex items-center gap-[8px] relative after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[var(--line)] px-[12px] py-[10px]">
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
