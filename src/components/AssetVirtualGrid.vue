<script setup lang="ts">
import { vTooltip } from './base/tooltip.ts'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import type { OfficialAsset } from '../domain/types.ts'
import { assetCategories } from '../domain/official-assets.ts'
import { assetGridWindow } from '../domain/asset-grid.ts'
import AssetImage from './AssetImage.vue'
import WuSvg from './base/WuSvg.vue'
import WuScrollArea from './base/WuScrollArea.vue'

const props = defineProps<{
  assets: readonly OfficialAsset[]
  selectedId: string | null
}>()
const emit = defineEmits<{ select: [id: string] }>()
const grid = useTemplateRef<HTMLElement>('gridRef')
const scrollArea = useTemplateRef<InstanceType<typeof WuScrollArea>>('scrollAreaRef')
const metrics = shallowRef({ width: 0, top: 0, height: 0 })
const window = computed(() => assetGridWindow(props.assets.length, metrics.value.width, metrics.value.top, metrics.value.height))
const visibleAssets = computed(() => props.assets.slice(window.value.start, window.value.end))
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
watch(() => props.assets.map(({ id }) => id).join('\n'), async () => {
  await nextTick()
  if (viewport.value) viewport.value.scrollTop = 0
  measure()
}, { flush: 'post' })
</script>

<template>
  <WuScrollArea ref="scrollAreaRef" scroll-chaining class="h-[100dvh] min-h-[480px]" content-class="pr-[12px]">
    <div ref="gridRef" class="relative [overflow-anchor:none]" :style="{ height: `${window.height}px` }">
      <div class="absolute left-0 right-0 top-0 grid gap-[10px]" :style="{ gridTemplateColumns: `repeat(${window.columns}, minmax(0, 1fr))`, transform: `translateY(${window.offset}px)` }">
        <button v-for="item in visibleAssets" :key="item.id" type="button" class="group min-w-0 cursor-pointer overflow-hidden rounded-[8px] border bg-[#0f211a] p-0 text-left transition-colors hover:border-[#4f9d78]" :style="{ height: `${window.rowHeight}px` }" :class="selectedId === item.id ? 'border-[var(--accent)]' : 'border-[var(--line)]'" @click="emit('select', item.id)">
          <AssetImage :key="item.previewUrl" :src="item.previewUrl" class="aspect-[4/3] w-full" />
          <div class="h-[70px] p-[12px]">
            <div class="truncate text-[13px] text-[#dceee3]" v-tooltip="item.name">{{ item.name }}</div>
            <div class="mt-[7px] flex items-center justify-between gap-[4px] text-[10px] text-[var(--muted)]">
              <span class="truncate">{{ item.categories.map((category) => assetCategories.find(({ id }) => id === category)?.name).join(' / ') }}</span>
              <WuSvg name="chevron-right" class="shrink-0 text-[#6e9a83] [--wu-svg-h:12px] group-hover:text-[var(--accent)]" />
            </div>
          </div>
        </button>
      </div>
    </div>
  </WuScrollArea>
</template>
