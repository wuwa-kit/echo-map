<script setup lang="ts">
defineProps<{ modelValue: boolean }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    class="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-[12px] text-left text-[13px] text-[#c7dfd2] min-[1024px]:min-h-[34px] min-[1024px]:text-[11px]"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span><slot /></span>
    <span
      class="flex h-[20px] w-[36px] shrink-0 items-center rounded-full border p-[2px] transition-colors"
      :class="modelValue ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[#537166] bg-[#233b32]'"
    >
      <span
        class="h-[14px] w-[14px] rounded-full transition-transform"
        :class="modelValue ? 'translate-x-[14px] bg-[#0b211a]' : 'translate-x-0 bg-[#b6c9c0]'"
      />
    </span>
  </button>
</template>
