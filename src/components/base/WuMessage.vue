<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { useSupported, useTimeoutFn } from '@vueuse/core'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  message: string
  type?: 'info' | 'error'
  duration?: number
}>(), {
  type: 'info',
  duration: 3500,
})
const emit = defineEmits<{ close: [] }>()
const panel = useTemplateRef<HTMLDivElement>('panelRef')
const isSupported = useSupported(() => typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype)
const colorClass = computed(() => props.type === 'error'
  ? 'border-[#8c5848] bg-[#382019f5] text-[#ffd0b8] shadow-[0_10px_32px_rgba(20,5,2,0.42)]'
  : 'border-[#3a6754] bg-[#102a20f5] text-[#bde6d1] shadow-[0_10px_32px_rgba(2,18,11,0.42)]')

function hide(): void {
  const element = panel.value
  if (isSupported.value && element?.isConnected && element.matches(':popover-open')) element.hidePopover()
}

function close(): void {
  stop()
  hide()
  emit('close')
}

const { start, stop } = useTimeoutFn(close, () => Math.max(0, props.duration), { immediate: false })

function show(): void {
  const element = panel.value
  if (!isSupported.value || !element?.isConnected || element.matches(':popover-open')) return
  element.showPopover()
}

watch(() => [panel.value, props.message, props.duration, isSupported.value] as const, ([element, message, duration, supported]) => {
  stop()
  if (!element?.isConnected || !message || !supported) {
    hide()
    return
  }
  show()
  if (duration > 0) start()
}, { immediate: true, flush: 'post' })

defineExpose({ show, close })
</script>

<template>
  <div
    v-bind="$attrs" ref="panelRef" popover="manual" :hidden="!isSupported"
    class="wu-floating-motion fixed inset-x-0 bottom-auto top-[12px] mx-auto my-0 w-max max-w-[calc(100vw-24px)] border rounded-[7px] px-[12px] py-[9px] text-[13px] leading-[18px] backdrop-blur-[8px] [&:popover-open]:flex"
    :class="colorClass"
  >
    <span class="min-w-0 whitespace-pre-wrap wrap-break-word">{{ message }}</span>
  </div>
</template>
