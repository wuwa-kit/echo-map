<script setup lang="ts">
import { vTooltip } from './base/tooltip.ts'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import type { OfficialAsset } from '../domain/types.ts'
import { virtualListWindow } from '../utils/virtual-list.ts'
import AssetImage from './AssetImage.vue'

const props = defineProps<{
  assets: readonly OfficialAsset[]
  selectedIndex: number
}>()
const emit = defineEmits<{ select: [id: string] }>()
const viewport = useTemplateRef<HTMLElement>('viewportRef')
const metrics = shallowRef({ width: 0, left: 0 })
const stride = 72
const window = computed(() => virtualListWindow(props.assets.length, stride, metrics.value.left, metrics.value.width))
const visibleAssets = computed(() => props.assets.slice(window.value.start, window.value.end))

function measure(): void {
  const element = viewport.value
  if (element) metrics.value = { width: element.clientWidth, left: element.scrollLeft }
}

function revealSelection(): void {
  const element = viewport.value
  if (!element || !element.clientWidth || props.selectedIndex < 0) return
  const left = props.selectedIndex * stride
  const right = left + stride - 8
  if (left < element.scrollLeft || right > element.scrollLeft + element.clientWidth) {
    element.scrollLeft = Math.max(0, (left + right - element.clientWidth) / 2)
  }
  measure()
}

useEventListener(viewport, 'scroll', measure, { passive: true })
useEventListener(viewport, 'wheel', (event) => {
  const element = viewport.value
  if (!element || event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
  event.preventDefault()
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1
  element.scrollLeft += event.deltaY * unit
  measure()
}, { passive: false })
useResizeObserver(viewport, () => {
  measure()
  revealSelection()
})
watch(() => props.selectedIndex, async () => {
  await nextTick()
  revealSelection()
}, { immediate: true, flush: 'post' })
</script>

<template>
  <div ref="viewportRef" class="h-[64px] w-full touch-pan-x overflow-x-auto overflow-y-hidden overscroll-contain [overflow-anchor:none]">
    <div class="relative h-full" :style="{ width: `${window.height}px` }">
      <div class="absolute left-0 top-0 flex gap-[8px]" :style="{ transform: `translateX(${window.before}px)` }">
        <button
          v-for="(asset, index) in visibleAssets" :key="asset.id" type="button" v-tooltip="asset.name"
          class="h-[64px] w-[64px] shrink-0 cursor-pointer overflow-hidden rounded-[7px] border-2 p-[3px] outline-none transition-colors"
          :class="window.start + index === selectedIndex ? 'border-[var(--accent)] bg-[#214b39]' : 'border-transparent bg-[#13281f] hover:border-[#477b68]'"
          @click="emit('select', asset.id)"
        >
          <AssetImage :key="asset.previewUrl" :src="asset.previewUrl" class="h-full w-full rounded-[3px]" />
        </button>
      </div>
    </div>
  </div>
</template>
