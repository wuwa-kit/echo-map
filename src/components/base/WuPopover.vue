<script setup lang="ts">
import { computed, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { useEventListener, useMutationObserver, useResizeObserver, useSupported } from '@vueuse/core'
import { popoverPosition, popoverWidth } from './popover-position.ts'
import type { WuPopoverPlacement, WuPopoverWidth } from './popover-position.ts'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  id?: string
  anchor: HTMLElement | null
  disabled?: boolean
  placement?: WuPopoverPlacement
  width?: WuPopoverWidth
  maxHeight?: number
  gap?: number
  viewportMargin?: number
}>(), {
  disabled: false,
  placement: 'bottom-start',
  width: 'content',
  maxHeight: 440,
  gap: 8,
  viewportMargin: 12,
})
const emit = defineEmits<{ opened: [], closed: [] }>()
const componentId = useId()
const popoverId = computed(() => props.id ?? `wu-popover-${componentId}`)
const panel = useTemplateRef<HTMLDivElement>('panelRef')
const openState = shallowRef(false)
const isOpen = computed(() => openState.value)
const isSupported = useSupported(() => typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype)

function updatePosition(): void {
  const element = panel.value
  if (!isSupported.value || !element?.matches(':popover-open') || !props.anchor) return
  const anchor = props.anchor.getBoundingClientRect()
  const visualViewport = window.visualViewport
  const viewport = {
    left: visualViewport?.offsetLeft ?? 0,
    top: visualViewport?.offsetTop ?? 0,
    width: visualViewport?.width ?? window.innerWidth,
    height: visualViewport?.height ?? window.innerHeight,
  }
  // Measure after applying the requested width so wrapping participates in placement.
  element.style.width = props.width === 'content' ? 'max-content' : `${popoverWidth(
    props.width, anchor.width, 0, viewport.width, props.viewportMargin,
  )}px`
  element.style.maxWidth = `${popoverWidth('viewport', 0, 0, viewport.width, props.viewportMargin)}px`
  element.style.maxHeight = `${Math.max(0, props.maxHeight)}px`
  const size = element.getBoundingClientRect()
  const position = popoverPosition({
    anchor, viewport, size, placement: props.placement, gap: props.gap,
    margin: props.viewportMargin, maxHeight: props.maxHeight,
  })
  Object.assign(element.style, {
    left: `${position.left}px`,
    top: `${position.top}px`,
    maxHeight: `${position.maxHeight}px`,
  })
}

function show(): void {
  const element = panel.value
  if (!isSupported.value || props.disabled || !element?.isConnected || element.matches(':popover-open')) return
  element.showPopover({ source: props.anchor ?? undefined })
  updatePosition()
}

function hide(): void {
  const element = panel.value
  if (isSupported.value && element?.isConnected && element.matches(':popover-open')) element.hidePopover()
}

function toggle(): void {
  if (isSupported.value && panel.value?.matches(':popover-open')) hide()
  else show()
}

function onBeforeToggle(event: ToggleEvent): void {
  if (event.newState === 'open' && props.disabled) event.preventDefault()
}

function onToggle(): void {
  const open = isSupported.value && (panel.value?.matches(':popover-open') ?? false)
  if (open) updatePosition()
  if (open === openState.value) return
  openState.value = open
  if (open) emit('opened')
  else emit('closed')
}

watch(() => props.disabled, (disabled) => { if (disabled) hide() })
watch(() => [props.anchor, props.placement, props.width, props.maxHeight, props.gap, props.viewportMargin], updatePosition, { flush: 'post' })
useEventListener(window, 'resize', updatePosition, { passive: true })
useEventListener(window, 'scroll', updatePosition, { capture: true, passive: true })
useEventListener(window.visualViewport, ['resize', 'scroll'], updatePosition, { passive: true })
useResizeObserver([() => props.anchor, panel], updatePosition)
useMutationObserver(panel, updatePosition, { childList: true, subtree: true, characterData: true })

defineExpose({ id: popoverId, isOpen, isSupported, show, hide, toggle, updatePosition })
</script>

<template>
  <div
    v-bind="$attrs" :id="popoverId" ref="panelRef" popover="auto" :hidden="!isSupported"
    class="fixed inset-auto m-0 min-h-0 box-border flex-col overflow-hidden p-0 [&:popover-open]:flex"
    @beforetoggle="onBeforeToggle" @toggle="onToggle"
  >
    <slot :is-open="isOpen" :close="hide" />
  </div>
</template>
