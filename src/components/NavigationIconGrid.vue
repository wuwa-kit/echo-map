<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { virtualListWindow } from '../utils/virtual-list.ts'
import NavigationArtwork from './NavigationArtwork.vue'
import WuEllipsis from './base/WuEllipsis.vue'
import WuScrollArea from './base/WuScrollArea.vue'

const props = defineProps<{
  icons: readonly { id: string; name: string; url: string }[]
  selectedId?: string | null
  active: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ selected: [id: string] }>()
const scrollArea = useTemplateRef<InstanceType<typeof WuScrollArea>>('scrollAreaRef')
const grid = useTemplateRef<HTMLElement>('gridRef')
const viewport = computed(() => scrollArea.value?.viewport ?? null)
const metrics = shallowRef({ top: 0, height: 0 })
const rowWindow = computed(() => virtualListWindow(Math.ceil(props.icons.length / 2), 54, metrics.value.top, metrics.value.height, 2))
const visibleIcons = computed(() => props.icons.slice(rowWindow.value.start * 2, rowWindow.value.end * 2))

function measure(): void {
  if (!grid.value || !viewport.value || !props.active) return
  metrics.value = { top: viewport.value.scrollTop, height: viewport.value.clientHeight }
}

useEventListener(viewport, 'scroll', measure, { passive: true })
useResizeObserver([grid, viewport], measure)
watch(() => [props.active, props.icons], async () => {
  await nextTick()
  if (!props.active) return
  if (viewport.value) viewport.value.scrollTop = 0
  measure()
}, { flush: 'post', immediate: true })
</script>

<template>
  <WuScrollArea ref="scrollAreaRef" size="sm" class="min-h-0 flex-1">
    <div ref="gridRef" class="relative [overflow-anchor:none]" :style="{ height: `${Math.max(0, rowWindow.height - 6)}px` }">
      <div class="absolute inset-x-0 top-0 grid grid-cols-2 gap-[6px]" :style="{ transform: `translateY(${rowWindow.before}px)` }">
        <button v-for="icon in visibleIcons" :key="icon.id" type="button" class="flex h-[48px] min-w-0 cursor-pointer items-center gap-[8px] rounded-[6px] px-[8px] text-left outline -outline-offset-1 disabled:cursor-not-allowed" :class="selectedId === icon.id ? 'bg-[#233b2d] outline-[#79c9a1]' : 'bg-[#171f1a] outline-transparent hover:bg-[#222e26]'" :disabled="disabled" @click="emit('selected', icon.id)">
          <NavigationArtwork :url="icon.url" class="h-[32px] w-[32px] shrink-0" />
          <WuEllipsis :text="icon.name || icon.id" class="min-w-0 flex-1 text-[11px]" />
        </button>
      </div>
    </div>
    <div v-if="!icons.length" class="p-[12px] text-center text-[12px] text-[#91ae9e]">暂无图标</div>
  </WuScrollArea>
</template>
