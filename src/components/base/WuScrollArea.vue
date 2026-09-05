<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, useTemplateRef } from 'vue'
import { useEventListener, useResizeObserver, useTimeoutFn } from '@vueuse/core'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  contentClass?: string
  minThumbSize?: number
  size?: 'md' | 'sm'
  viewportClass?: string
  unbounded?: boolean
}>(), {
  contentClass: '',
  size: 'md',
  viewportClass: '',
  unbounded: false,
})

const viewport = useTemplateRef<HTMLElement>('viewportRef')
const content = useTemplateRef<HTMLElement>('contentRef')
const track = useTemplateRef<HTMLElement>('trackRef')
const clientHeight = shallowRef(0)
const scrollHeight = shallowRef(0)
const scrollTop = shallowRef(0)
const trackHeight = shallowRef(0)
const scrollbarActive = shallowRef(false)
let dragState: {
  pointerId: number
  startClientY: number
  startScrollTop: number
} | null = null

const canScroll = computed(() => !props.unbounded && scrollHeight.value > clientHeight.value + 1)
const scrollRange = computed(() => Math.max(0, scrollHeight.value - clientHeight.value))
const actualMinThumbSize = computed(() => props.minThumbSize ?? (props.size === 'sm' ? 20 : 28))
const trackSizeClass = computed(() => props.size === 'sm'
  ? 'bottom-1px right-0 top-1px w-4px'
  : 'bottom-3px right-2px top-3px w-8px')
const thumbSizeClass = computed(() => props.size === 'sm' ? 'w-2px' : 'w-4px')
const thumbHeight = computed(() => {
  if (!canScroll.value || trackHeight.value === 0) {
    return 0
  }
  return Math.min(
    trackHeight.value,
    Math.max(actualMinThumbSize.value, trackHeight.value * clientHeight.value / scrollHeight.value),
  )
})
const thumbTravel = computed(() => Math.max(0, trackHeight.value - thumbHeight.value))
const thumbTop = computed(() => {
  if (scrollRange.value === 0) {
    return 0
  }
  return thumbTravel.value * scrollTop.value / scrollRange.value
})
const thumbStyle = computed(() => ({
  height: `${thumbHeight.value}px`,
  transform: `translateY(${thumbTop.value}px)`,
}))

const { start: scheduleScrollbarHide, stop: cancelScrollbarHide } = useTimeoutFn(
  () => {
    scrollbarActive.value = false
  },
  800,
  { immediate: false },
)

function updateMetrics(): void {
  const viewportElement = viewport.value
  if (!viewportElement) {
    return
  }
  clientHeight.value = viewportElement.clientHeight
  scrollHeight.value = viewportElement.scrollHeight
  scrollTop.value = viewportElement.scrollTop
  trackHeight.value = track.value?.clientHeight ?? 0
}

function revealScrollbar(): void {
  scrollbarActive.value = true
  cancelScrollbarHide()
  scheduleScrollbarHide()
}

function onScroll(): void {
  updateMetrics()
  revealScrollbar()
}

function onTrackPointerDown(event: PointerEvent): void {
  const viewportElement = viewport.value
  const trackElement = track.value
  if (!viewportElement || !trackElement || thumbTravel.value === 0) {
    return
  }
  const trackRect = trackElement.getBoundingClientRect()
  const nextThumbTop = Math.min(
    thumbTravel.value,
    Math.max(0, event.clientY - trackRect.top - thumbHeight.value / 2),
  )
  viewportElement.scrollTop = nextThumbTop / thumbTravel.value * scrollRange.value
  revealScrollbar()
}

function onThumbPointerDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return
  }
  event.preventDefault()
  const thumbElement = event.currentTarget as HTMLElement
  thumbElement.setPointerCapture(event.pointerId)
  dragState = {
    pointerId: event.pointerId,
    startClientY: event.clientY,
    startScrollTop: viewport.value?.scrollTop ?? 0,
  }
  scrollbarActive.value = true
  cancelScrollbarHide()
}

function onThumbPointerMove(event: PointerEvent): void {
  const viewportElement = viewport.value
  if (!viewportElement || dragState?.pointerId !== event.pointerId || thumbTravel.value === 0) {
    return
  }
  const deltaY = event.clientY - dragState.startClientY
  viewportElement.scrollTop = dragState.startScrollTop + deltaY / thumbTravel.value * scrollRange.value
}

function finishThumbDrag(event: PointerEvent): void {
  if (dragState?.pointerId !== event.pointerId) {
    return
  }
  dragState = null
  revealScrollbar()
}

useEventListener(viewport, 'scroll', onScroll, { passive: true })
useResizeObserver([viewport, content, track], updateMetrics)

onMounted(() => {
  void nextTick(updateMetrics)
})
</script>

<template>
  <div
    v-bind="$attrs"
    class="relative min-h-0 min-w-0 flex flex-col"
    :class="unbounded ? 'overflow-visible' : 'overflow-hidden'"
  >
    <div
      ref="viewportRef"
      class="min-h-0 min-w-0"
      :class="[viewportClass, unbounded ? 'overflow-visible' : 'flex-1 overflow-x-hidden overflow-y-auto overscroll-contain']"
    >
      <div ref="contentRef" class="min-w-0" :class="contentClass">
        <slot />
      </div>
    </div>
    <div
      v-show="canScroll"
      ref="trackRef"
      class="absolute z-10 cursor-pointer rounded-full transition-opacity duration-180"
      :class="[
        trackSizeClass,
        scrollbarActive ? 'opacity-100' : 'opacity-35 hover:opacity-100',
      ]"
      aria-hidden="true"
      @pointerdown="onTrackPointerDown"
    >
      <div
        class="mx-auto cursor-grab touch-none select-none rounded-full bg-[rgba(139,247,211,0.58)] shadow-[0_0_8px_rgba(101,241,194,0.16)] hover:bg-[rgba(139,247,211,0.82)] active:cursor-grabbing active:bg-[rgba(139,247,211,0.94)]"
        :class="thumbSizeClass"
        :style="thumbStyle"
        @pointercancel.stop="finishThumbDrag"
        @pointerdown.stop="onThumbPointerDown"
        @pointermove.stop="onThumbPointerMove"
        @pointerup.stop="finishThumbDrag"
      />
    </div>
  </div>
</template>
