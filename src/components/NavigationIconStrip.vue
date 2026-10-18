<script setup lang="ts">
import { computed, watch } from 'vue'
import { useResizeObserver, useVirtualList } from '@vueuse/core'
import NavigationArtwork from './NavigationArtwork.vue'
import WuEllipsis from './base/WuEllipsis.vue'

const props = defineProps<{ icons: readonly { id: string; url: string; name: string }[]; selectedId?: string }>()
defineEmits<{ selected: [id: string] }>()
const { list, containerProps, wrapperProps } = useVirtualList(computed(() => [...props.icons]), {
  itemWidth: 92,
  overscan: 4,
})
const viewport = containerProps.ref

function revealSelected(): void {
  const element = viewport.value
  if (!element || element.clientWidth === 0) return
  const index = props.icons.findIndex(icon => icon.id === props.selectedId)
  if (index < 0) return
  const left = index * 92
  const right = left + 84
  const padding = 0
  if (left >= element.scrollLeft + padding && right <= element.scrollLeft + element.clientWidth - padding) return
  element.scrollTo({ left: left + 42 - element.clientWidth / 2, behavior: 'instant' })
  containerProps.onScroll()
}

watch(() => [props.selectedId, props.icons, viewport.value], revealSelected, { flush: 'post' })
useResizeObserver(viewport, revealSelected)
</script>

<template>
  <div class="relative shrink-0 bg-black/15 p-[16px]">
    <div class="absolute inset-x-0 top-0 h-px bg-white/10" />
    <div v-bind="containerProps" class="relative h-[102px] overflow-y-hidden">
      <div v-bind="wrapperProps">
      <button v-for="{ data: icon } in list" :key="icon.id" type="button" class="mr-[8px] flex h-[86px] w-[84px] shrink-0 cursor-pointer flex-col items-center gap-[6px] rounded-[6px] p-[8px] outline -outline-offset-1" :class="selectedId === icon.id ? 'bg-[#233b2d] outline-[#79c9a1]' : 'outline-transparent hover:bg-white/5'" @click="$emit('selected', icon.id)">
        <NavigationArtwork :url="icon.url" class="h-[48px] w-[48px]" />
        <WuEllipsis :text="icon.name || icon.id.replace('unpack-map-', '')" class="w-full text-center text-[11px]" />
      </button>
      </div>
    </div>
  </div>
</template>
