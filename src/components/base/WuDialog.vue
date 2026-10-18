<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { floatingExitSize } from './floating-exit-size.ts'
import WuDialogContent from './WuDialogContent.ts'
import WuButton from './WuButton.vue'
import { useSupported } from '@vueuse/core'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  size?: 'sm' | 'md' | 'lg' | 'fullscreen'
  layout?: 'content' | 'panel'
  padded?: boolean
  mobileFullscreen?: boolean
  closeText?: string
  dismissible?: boolean
}>(), {
  dismissible: true,
  size: 'sm',
  layout: 'content',
  padded: true,
  mobileFullscreen: false,
  closeText: '关闭',
})
const sizes = { sm: 'w-[min(420px,calc(100vw-32px))]', md: 'w-[min(680px,calc(100vw-32px))]', lg: 'w-[min(1080px,calc(100vw-32px))]', fullscreen: 'm-0 h-dvh max-h-none w-screen max-w-none rounded-none' }
const emit = defineEmits<{ dismissRequested: [] }>()
const panel = useTemplateRef<HTMLDialogElement>('panelRef')
const isSupported = useSupported(() => typeof HTMLDialogElement !== 'undefined' && 'showModal' in HTMLDialogElement.prototype)

const exitSize = floatingExitSize()

function show(): void {
  const element = panel.value
  if (!isSupported.value || !element?.isConnected || element.open) return
  exitSize.restore()
  element.showModal()
}

function hide(): void {
  const element = panel.value
  if (element?.isConnected && element.open) element.close()
}

function requestDismiss(): void {
  if (props.dismissible) emit('dismissRequested')
}

function onCancel(event: Event): void {
  event.preventDefault()
  requestDismiss()
}

function onClick(event: MouseEvent): void {
  if (event.target !== panel.value || !panel.value) return
  const rect = panel.value.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestDismiss()
}

watch(() => props.open, open => {
  if (!open && panel.value?.open) exitSize.capture(panel.value)
}, { flush: 'sync' })

watch(() => [props.open, isSupported.value] as const, ([open, supported]) => {
  if (open && supported) show()
  else hide()
}, { immediate: true, flush: 'post' })
onMounted(() => { if (props.open) show() })
onBeforeUnmount(() => { hide(); exitSize.restore() })

defineExpose({ show, hide, isSupported })
</script>

<template>
  <dialog v-bind="$attrs" ref="panelRef"
    class="wu-dialog max-w-none overflow-hidden bg-[#0d1e18] p-0 text-[#eaf4ef] outline -outline-offset-1 outline-[var(--line)] shadow-[0_24px_80px_rgba(0,0,0,0.58)] flex-col [&[open]]:flex"
    :class="[sizes[size], size !== 'fullscreen' ? 'm-auto max-h-[calc(100dvh-32px)] rounded-[12px]' : '', layout === 'panel' && size !== 'fullscreen' ? 'h-[min(720px,calc(100dvh-32px))]' : '', mobileFullscreen ? 'max-sm:m-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-screen max-sm:rounded-none' : '']"
    @cancel="onCancel" @click="onClick">
    <WuDialogContent :active="open">
    <div class="relative flex h-[56px] shrink-0 items-center justify-between gap-[12px] px-[16px] sm:px-[24px]">
      <div class="flex min-w-0 items-center gap-[12px]"><span class="truncate text-[15px] font-semibold">{{ title }}</span><slot name="heading-extra" /></div>
      <WuButton size="sm" variant="ghost" icon="close" :disabled="!dismissible" @click="requestDismiss">{{ closeText }}</WuButton>
      <div class="absolute inset-x-0 bottom-0 h-px bg-[var(--line)]" />
    </div>
    <div class="min-h-0 overflow-auto overscroll-contain" :class="[layout === 'panel' ? 'flex flex-1 flex-col' : '', padded ? 'p-[16px] sm:p-[24px]' : '']"><slot /></div>
    <div v-if="$slots.footer" class="relative flex shrink-0 flex-wrap items-center justify-end gap-[8px] px-[16px] py-[16px] pb-[max(16px,env(safe-area-inset-bottom))] sm:px-[24px]"><div class="absolute inset-x-0 top-0 h-px bg-[var(--line)]" /><slot name="footer" /></div>
    <div v-if="$slots.strip" class="relative shrink-0"><div class="absolute inset-x-0 top-0 h-px bg-[var(--line)]" /><slot name="strip" /></div>
    </WuDialogContent>
  </dialog>
</template>
