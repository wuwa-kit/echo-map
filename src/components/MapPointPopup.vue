<script setup lang="ts">
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
  <div class="absolute left-12px top-64px z-70 max-h-[55%] w-[min(340px,calc(100%_-_24px))] flex flex-col overflow-hidden rounded-12px border border-[var(--line)] bg-[#0b1b16f5] text-14px shadow-xl">
    <div class="min-h-52px shrink-0 flex items-center gap-8px border-b border-[var(--line)] px-12px py-10px">
      <button v-if="showBack" class="h-30px w-30px shrink-0 flex cursor-pointer items-center justify-center rounded-6px border border-[var(--line)] bg-[#13271f] p-0 text-18px text-[#b8d5c7] leading-none hover:border-[#477b68] hover:bg-[#193329] hover:text-[#e7f4ee]" type="button" @click="$emit('back')">←</button>
      <div class="min-w-0 flex-1 text-[#e7f4ee]">
        <slot name="title" />
      </div>
      <button class="h-30px w-30px shrink-0 flex cursor-pointer items-center justify-center rounded-6px border-0 bg-transparent p-0 text-20px text-[#99b8a9] leading-none hover:bg-[#183128] hover:text-[#e7f4ee]" type="button" @click="$emit('close')">×</button>
    </div>
    <div class="min-h-0 flex flex-1 flex-col overflow-hidden">
      <slot />
    </div>
  </div>
</template>
