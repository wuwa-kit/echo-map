<script setup lang="ts">
import { computed, onScopeDispose, shallowRef, useSlots, useTemplateRef, watch } from 'vue'
import { useEventListener, useMutationObserver, useResizeObserver, useSupported } from '@vueuse/core'
import { tooltipPosition } from './tooltip-position.ts'
import type { WuTooltipPlacement } from './tooltip-position.ts'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  content?: string
  disabled?: boolean
  placement?: WuTooltipPlacement
  delay?: number
  gap?: number
  viewportMargin?: number
  maxWidth?: number
}>(), {
  content: '',
  disabled: false,
  placement: 'top',
  delay: 300,
  gap: 8,
  viewportMargin: 12,
  maxWidth: 240,
})
const emit = defineEmits<{ opened: [], closed: [] }>()
const slots = useSlots()
const trigger = useTemplateRef<HTMLSpanElement>('triggerRef')
const panel = useTemplateRef<HTMLSpanElement>('panelRef')
const openState = shallowRef(false)
const isOpen = computed(() => openState.value)
const hasContent = computed(() => props.content.trim().length > 0 || Boolean(slots.content))
const isSupported = useSupported(() => typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype)
let showTimer: ReturnType<typeof setTimeout> | null = null
let resizeFrame: number | null = null

function clearShowTimer(): void {
  if (showTimer === null) return
  clearTimeout(showTimer)
  showTimer = null
}

function updatePosition(): void {
  const element = panel.value
  if (!isSupported.value || !element?.matches(':popover-open') || !trigger.value) return
  const visualViewport = window.visualViewport
  const viewport = {
    left: visualViewport?.offsetLeft ?? 0,
    top: visualViewport?.offsetTop ?? 0,
    width: visualViewport?.width ?? window.innerWidth,
    height: visualViewport?.height ?? window.innerHeight,
  }
  const margin = Math.max(0, props.viewportMargin)
  const maxWidth = Math.max(0, Math.min(props.maxWidth, viewport.width - margin * 2))
  const maxHeight = Math.max(0, viewport.height - margin * 2)
  element.style.maxWidth = `${maxWidth}px`
  element.style.maxHeight = `${maxHeight}px`
  const position = tooltipPosition({
    anchor: trigger.value.getBoundingClientRect(),
    viewport,
    size: element.getBoundingClientRect(),
    placement: props.placement,
    gap: props.gap,
    margin,
  })
  element.style.left = `${position.left}px`
  element.style.top = `${position.top}px`
}

function schedulePositionUpdate(): void {
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null
    updatePosition()
  })
}

function open(): void {
  const element = panel.value
  showTimer = null
  if (!isSupported.value || props.disabled || !hasContent.value || !element?.isConnected || element.matches(':popover-open')) return
  element.showPopover({ source: trigger.value ?? undefined })
  updatePosition()
}

function show(event?: PointerEvent): void {
  if (event?.pointerType === 'touch' || props.disabled || !hasContent.value) return
  clearShowTimer()
  if (props.delay <= 0) open()
  else showTimer = setTimeout(open, props.delay)
}

function hide(): void {
  clearShowTimer()
  const element = panel.value
  if (isSupported.value && element?.isConnected && element.matches(':popover-open')) element.hidePopover()
}

function onToggle(): void {
  const open = isSupported.value && (panel.value?.matches(':popover-open') ?? false)
  if (open) updatePosition()
  if (open === openState.value) return
  openState.value = open
  if (open) emit('opened')
  else emit('closed')
}

watch([() => props.disabled, hasContent], ([disabled, content]) => { if (disabled || !content) hide() })
watch(() => [props.content, props.placement, props.gap, props.viewportMargin, props.maxWidth], updatePosition, { flush: 'post' })
useEventListener(window, 'resize', updatePosition, { passive: true })
useEventListener(window, 'scroll', updatePosition, { capture: true, passive: true })
useEventListener(window.visualViewport, ['resize', 'scroll'], updatePosition, { passive: true })
useResizeObserver([trigger, panel], schedulePositionUpdate)
useMutationObserver(panel, updatePosition, { childList: true, subtree: true, characterData: true })
onScopeDispose(() => {
  clearShowTimer()
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
})

defineExpose({ isOpen, isSupported, show, hide, updatePosition })
</script>

<template>
  <span
    v-bind="$attrs" ref="triggerRef" class="min-w-0"
    @pointerenter="show" @pointerleave="hide" @pointerdown="hide"
  ><slot /></span>
  <span
    ref="panelRef" popover="manual" :hidden="!isSupported"
    class="pointer-events-none fixed inset-auto m-0 w-max box-border select-none overflow-hidden break-words border-0 rounded-5px bg-[#e5eee7] px-10px py-7px text-13px text-[#263b31] font-600 leading-18px shadow-lg [&:popover-open]:block"
    @toggle="onToggle"
  ><slot name="content">{{ content }}</slot></span>
</template>
