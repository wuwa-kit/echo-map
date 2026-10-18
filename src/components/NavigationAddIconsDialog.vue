<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { virtualListWindow } from '../utils/virtual-list.ts'
import { useNavigationIconManagerStore } from '../stores/navigation-icon-manager.ts'
import { iconSources } from '../domain/navigation-icon-pool.ts'
import { iconDisplayName } from '../domain/navigation-icon-library.ts'
import NavigationArtwork from './NavigationArtwork.vue'
import WuDialog from './base/WuDialog.vue'
import WuButton from './base/WuButton.vue'
import WuInput from './base/WuInput.vue'
import WuEllipsis from './base/WuEllipsis.vue'
import WuScrollArea from './base/WuScrollArea.vue'

const store = useNavigationIconManagerStore()
const sources = computed(() => [{ id: 'all', name: '全部' } as const, ...iconSources.filter(source => source.id !== 'placeholder' && (store.addingCategory?.id !== 'category-special-boss' || source.id === 'echo-catalog'))])
const scrollArea = useTemplateRef<InstanceType<typeof WuScrollArea>>('scrollAreaRef')
const grid = useTemplateRef<HTMLElement>('gridRef')
const viewport = computed(() => scrollArea.value?.viewport ?? null)
const metrics = shallowRef({ width: 0, top: 0, height: 0 })
const columns = computed(() => Math.max(1, Math.floor((metrics.value.width + 8) / 112)))
const rowWindow = computed(() => virtualListWindow(Math.ceil(store.addingIcons.length / columns.value), 132, metrics.value.top, metrics.value.height))
const visibleIcons = computed(() => store.addingIcons.slice(rowWindow.value.start * columns.value, rowWindow.value.end * columns.value))

function measure(): void {
  if (!grid.value || !viewport.value) return
  metrics.value = { width: grid.value.clientWidth, top: viewport.value.scrollTop, height: viewport.value.clientHeight }
}

useEventListener(viewport, 'scroll', measure, { passive: true })
useResizeObserver([grid, viewport], measure)
watch(() => [store.memberSearch, store.addingSource, store.addingEchoCost, store.addingCategory?.id], async () => {
  await nextTick()
  if (!store.addingCategory) return
  if (viewport.value) viewport.value.scrollTop = 0
  measure()
}, { flush: 'post' })
</script>

<template>
  <WuDialog :open="store.addingOpen" title="添加图标" size="lg" layout="panel" mobile-fullscreen :padded="false" :dismissible="!store.saving" @dismiss-requested="store.closeAddIcons" @after-close="store.finishCloseAddIcons">
    <template #heading-extra><WuEllipsis :text="store.addingCategory?.name ?? ''" class="text-[12px] text-[#8d9c94]" /></template>
    <div class="flex shrink-0 flex-wrap items-center gap-[12px] p-[16px] sm:px-[24px]">
      <WuInput class="w-[240px] max-w-full" :model-value="store.memberSearch" :disabled="store.saving" placeholder="搜索名称或 ID" @update:model-value="store.setMemberSearch" />
      <div v-if="sources.length > 2" class="flex gap-[4px]">
        <button v-for="source in sources" :key="source.id" type="button" class="h-[34px] cursor-pointer rounded-[6px] px-[12px] text-[12px] disabled:cursor-not-allowed" :class="store.addingSource === source.id ? 'bg-[#25392e] text-[#b4e5cc]' : 'text-[#99a79f] hover:bg-white/5'" :disabled="store.saving" @click="store.setAddingSource(source.id)">{{ source.name }}</button>
      </div>
      <div v-if="store.addingEchoCostVisible" class="flex items-center gap-[4px]">
        <button v-for="option in [{ value: null, name: '全部' }, { value: 1, name: 'C1' }, { value: 3, name: 'C3' }] as const" :key="option.name" type="button" class="h-[34px] cursor-pointer rounded-[6px] px-[12px] text-[12px] disabled:cursor-not-allowed" :class="store.addingEchoCost === option.value ? 'bg-[#25392e] text-[#b4e5cc]' : 'text-[#99a79f] hover:bg-white/5'" :disabled="store.saving" @click="store.setAddingEchoCost(option.value)">{{ option.name }}</button>
      </div>
    </div>
    <WuScrollArea ref="scrollAreaRef" class="min-h-0 flex-1" content-class="px-[16px] pb-[24px] sm:px-[24px]">
      <div ref="gridRef" class="relative [overflow-anchor:none]" :style="{ height: `${Math.max(0, rowWindow.height - 8)}px` }">
      <div class="absolute inset-x-0 top-0 grid gap-[8px]" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, transform: `translateY(${rowWindow.before}px)` }">
        <button v-for="icon in visibleIcons" :key="icon.id" type="button" class="relative flex h-[124px] min-w-0 cursor-pointer flex-col items-center justify-center gap-[10px] rounded-[8px] px-[10px] outline -outline-offset-1 disabled:cursor-not-allowed" :class="store.addingMemberIds.has(icon.id) ? 'bg-[#171f1a] opacity-45 outline-transparent' : store.addingIds.includes(icon.id) ? 'bg-[#233b2d] outline-[#79c9a1]' : 'bg-[#171f1a] outline-transparent hover:bg-[#222e26]'" :disabled="store.saving || store.addingMemberIds.has(icon.id)" @click="store.toggleAddingIcon(icon.id)">
          <span v-if="store.addingMemberIds.has(icon.id)" class="absolute right-[6px] top-[5px] text-[10px] text-[#99a79f]">已归类</span>
          <span v-else-if="store.addingIds.includes(icon.id)" class="absolute right-[8px] top-[5px] text-[#79c9a1]">✓</span>
          <NavigationArtwork :url="icon.url" class="h-[64px] w-[64px] shrink-0" />
          <WuEllipsis :text="iconDisplayName(icon)" class="w-full text-center text-[12px]" />
        </button>
      </div>
      </div>
      <div v-if="!store.addingIcons.length" class="py-[80px] text-center text-[13px] text-[#8d9c94]">没有匹配的图标</div>
    </WuScrollArea>
    <template #footer>
      <div class="mr-auto flex items-center gap-[12px]"><span class="text-[12px] text-[#99a79f]">已选 {{ store.addingIds.length }} 个</span><WuButton size="sm" variant="ghost" :disabled="store.saving || !store.addingIds.length" @click="store.clearAddingSelection">清空选择</WuButton></div>
      <WuButton variant="solid" tone="accent" :disabled="store.saving || !store.addingIds.length" :loading="store.saving" @click="store.confirmAddIcons">添加 {{ store.addingIds.length }} 个图标</WuButton>
    </template>
  </WuDialog>
</template>
