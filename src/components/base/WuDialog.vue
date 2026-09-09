<script setup lang="ts">
import { onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { useSupported } from '@vueuse/core'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  open: boolean
  dismissible?: boolean
}>(), {
  dismissible: true,
})
const emit = defineEmits<{ dismissRequested: [] }>()
const panel = useTemplateRef<HTMLDialogElement>('panelRef')
const isSupported = useSupported(() => typeof HTMLDialogElement !== 'undefined' && 'showModal' in HTMLDialogElement.prototype)

function show(): void {
  const element = panel.value
  if (!isSupported.value || !element?.isConnected || element.open) return
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
  if (event.target === panel.value) requestDismiss()
}

watch(() => [props.open, isSupported.value] as const, ([open, supported]) => {
  if (open && supported) show()
  else hide()
}, { immediate: true, flush: 'post' })
onBeforeUnmount(hide)

defineExpose({ show, hide, isSupported })
</script>

<template>
  <dialog
    v-bind="$attrs" ref="panelRef"
    class="wu-dialog m-auto max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-24px))] overflow-hidden border border-[#416353] rounded-10px bg-[#10231cf7] p-0 text-[#d7eadf] shadow-[0_24px_80px_rgba(0,0,0,0.58)]"
    @cancel="onCancel" @click="onClick"
  >
    <slot />
  </dialog>
</template>
