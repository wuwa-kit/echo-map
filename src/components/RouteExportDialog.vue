<script setup lang="ts">
import { onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouteExportStore } from '../stores/route-export.ts'

const store = useRouteExportStore()
const { open, status, progress, error, artifacts } = storeToRefs(store)
const panel = useTemplateRef<HTMLDivElement>('panelRef')

watch(open, (visible) => {
  const element = panel.value
  if (!element) return
  if (visible) {
    element.showPopover()
  } else if (element.matches(':popover-open')) {
    element.hidePopover()
  }
}, { flush: 'post' })

onBeforeUnmount(() => {
  store.dispose()
})
</script>

<template>
  <div ref="panelRef" popover="manual" class="fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none border-0 bg-[#07110ff5] p-0 text-[#e7f5ee]">
    <div class="mx-auto h-full max-w-900px flex flex-col">
      <div class="shrink-0 flex items-center justify-between gap-12px border-b border-[#294539] p-16px">
        <div class="text-18px font-600">路线长图</div>
        <button type="button" class="min-h-44px rounded-6px border border-[#456354] bg-transparent px-16px text-inherit" @click="store.close">{{ status === 'running' ? '取消并关闭' : '关闭' }}</button>
      </div>
      <div v-if="status === 'running'" class="flex flex-1 flex-col items-center justify-center gap-16px p-24px">
        <div class="text-16px">{{ progress.message }}</div>
        <div class="text-14px text-[#afc6bb]">{{ progress.completed }} / {{ progress.total || '…' }} 张子图</div>
        <div class="text-center text-13px text-[#afc6bb]">正在生成完整长图和手机分卷，请保持页面打开。</div>
      </div>
      <div v-else-if="status === 'error' || status === 'cancelled'" class="flex flex-1 flex-col items-center justify-center gap-16px p-24px">
        <div class="text-15px text-[#efc697]">{{ error || '生成已取消' }}</div>
        <button type="button" class="min-h-44px rounded-6px border-0 bg-[#65f1c2] px-24px text-[#08231d]" @click="store.retry">重新生成</button>
      </div>
      <template v-else-if="artifacts">
        <div class="shrink-0 border-b border-[#294539] p-16px">
          <div :title="artifacts.title" class="line-clamp-2 text-15px">{{ artifacts.title }}</div>
          <div v-if="artifacts.fullUrl" class="mt-6px text-12px text-[#afc6bb]">{{ artifacts.width }} × {{ artifacts.height }} 像素 · {{ artifacts.columns }} 列 · {{ artifacts.maps.length }} 张分地图 · {{ artifacts.pages.length }} 张手机分卷</div>
          <div v-else class="mt-6px text-12px text-[#e5bd7c]">完整长图超出浏览器尺寸限制，已保留 {{ artifacts.maps.length }} 张分地图图片和 {{ artifacts.pages.length }} 张手机分卷。</div>
          <div class="mt-12px flex gap-8px overflow-x-auto whitespace-nowrap pb-4px">
            <a v-if="artifacts.fullUrl" :href="artifacts.fullUrl" :download="`${artifacts.filename}.jpg`" class="min-h-44px flex shrink-0 items-center rounded-6px bg-[#65f1c2] px-16px text-14px text-[#08231d] no-underline">保存完整长图</a>
            <a v-for="map in artifacts.maps" :key="map.url" :href="map.url" :download="`${map.filename}.jpg`" class="min-h-44px flex shrink-0 items-center rounded-6px border border-[#65f1c2] px-12px text-14px text-[#b9ffe7] no-underline">{{ map.title }}</a>
            <a v-for="(page, index) in artifacts.pages" :key="page.url" :href="page.url" :download="`${artifacts.filename}-${String(index + 1).padStart(2, '0')}.jpg`" class="min-h-44px flex shrink-0 items-center rounded-6px border border-[#456354] px-12px text-14px text-inherit no-underline">分卷 {{ index + 1 }}</a>
          </div>
          <div class="mt-10px text-12px text-[#afc6bb]">下方预览{{ artifacts.fullUrl ? '完整长图' : '第一张分地图图片' }}，可长按保存。</div>
        </div>
        <div v-if="artifacts.fullUrl || artifacts.maps[0]" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <img :src="artifacts.fullUrl ?? artifacts.maps[0]?.url" :width="artifacts.width ?? artifacts.maps[0]?.width" :height="artifacts.height ?? artifacts.maps[0]?.height" decoding="async" class="block h-auto w-full" />
        </div>
      </template>
    </div>
  </div>
</template>
