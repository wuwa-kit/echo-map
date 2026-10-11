<script setup lang="ts">
import WuInput from './WuInput.vue'
import WuButton from './WuButton.vue'

withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  variant?: 'outline' | 'plain'
  size?: 'sm' | 'md'
  disabled?: boolean
  readonly?: boolean
}>(), { variant: 'outline', size: 'md', disabled: false, readonly: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="relative min-w-0 w-full" :class="variant === 'plain' ? 'h-full' : ''">
    <WuInput :model-value="modelValue" type="search" :placeholder="placeholder" :variant="variant" :size="size" :disabled="disabled" :readonly="readonly" :class="modelValue && !readonly ? '!pr-[32px]' : ''" @update:model-value="emit('update:modelValue', $event)" />
    <WuButton v-if="modelValue && !readonly" class="absolute right-[4px] top-1/2 -translate-y-1/2" variant="ghost" size="xs" icon="close" icon-only :disabled="disabled" @click="emit('update:modelValue', '')" />
  </div>
</template>
