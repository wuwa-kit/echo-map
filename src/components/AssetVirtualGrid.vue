<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import type { AssetGroup } from '../domain/asset-browser.ts'
import { assetGroupWindow } from '../domain/asset-grid.ts'
import AssetImage from './AssetImage.vue'
import WuScrollArea from './base/WuScrollArea.vue'

const props = defineProps<{
  groups: readonly AssetGroup[]
  selectedId: string | null
  locked?: boolean
}>()
const emit = defineEmits<{ select: [id: string] }>()
const grid = useTemplateRef<HTMLElement>('gridRef')
const scrollArea = useTemplateRef<InstanceType<typeof WuScrollArea>>('scrollAreaRef')
const metrics = shallowRef({ width: 0, top: 0, height: 0 })
const window = computed(() => assetGroupWindow(props.groups, metrics.value.width, metrics.value.top, metrics.value.height))
const viewport = computed(() => scrollArea.value?.viewport ?? null)

function measure(): void {
  if (!grid.value || !viewport.value) return
  metrics.value = {
    width: grid.value.clientWidth,
    top: viewport.value.scrollTop,
    height: viewport.value.clientHeight,
  }
}

useEventListener(viewport, 'scroll', measure, { passive: true })
useResizeObserver([grid, viewport], measure)
watch(() => props.groups.map(group => group.id + ':' + group.assets.map(asset => asset.id).join(',')).join(';'), async () => {
  await nextTick()
  if (viewport.value) viewport.value.scrollTop = 0
  measure()
}, { flush: 'post' })
</script>

<template>
  <WuScrollArea ref="scrollAreaRef" class="min-h-0 flex-1" content-class="px-[20px] pb-[20px] pr-[26px]" :viewport-class="locked ? 'overflow-y-hidden!' : ''">
    <div ref="gridRef" class="relative [overflow-anchor:none]" :style="{ height: `${window.height}px` }">
      <template v-for="entry in window.visible" :key="entry.group.id">
      <div v-if="entry.titleVisible && entry.group.categoryTitle" class="absolute inset-x-0 flex h-[40px] items-center text-[15px] font-semibold text-[#eaf4ef]" :style="{ top: `${entry.top}px` }">{{ entry.group.categoryTitle }}</div>
      <div v-if="entry.titleVisible && entry.group.name" class="absolute inset-x-0 flex h-[40px] items-center text-[13px] font-semibold text-[#b5cbc0]" :style="{ top: `${entry.top + (entry.group.categoryTitle ? 40 : 0)}px` }">{{ entry.group.name }}</div>
      <div class="absolute left-0 right-0 top-0 grid gap-[10px]" :style="{ gridTemplateColumns: `repeat(${window.columns}, minmax(0, 1fr))`, transform: `translateY(${entry.offset}px)` }">
        <button v-for="item in entry.assets" :key="item.id" type="button" class="relative isolate min-w-0 cursor-pointer overflow-hidden rounded-[8px] outline-none bg-[#0f211a] p-0 text-left after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:outline after:-outline-offset-1 after:transition-colors hover:after:outline-[#4f9d78] focus:after:outline-[var(--accent)]" :style="{ height: `${window.rowHeight}px` }" :class="selectedId === item.id ? 'after:outline-[var(--accent)]' : 'after:outline-[var(--line)]'" @click="emit('select', item.id)">
          <AssetImage :key="item.previewUrl" :src="item.previewUrl" class="aspect-[4/3] w-full" />
          <div class="h-[44px] p-[12px]">
            <div class="truncate text-[13px] text-[#dceee3]" v-tooltip="item.name">{{ item.name }}</div>
          </div>
        </button>
      </div>
      </template>
    </div>
  </WuScrollArea>
</template>
