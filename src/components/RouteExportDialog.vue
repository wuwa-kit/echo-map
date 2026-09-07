<script setup lang="ts">
import { nextTick, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouteExportStore } from '../stores/route-export.ts'

const store = useRouteExportStore()
const { open, status, progress, error, artifacts } = storeToRefs(store)
const panel = useTemplateRef<HTMLDivElement>('panelRef')
let previousFocus: HTMLElement | null = null
let background: { element: HTMLElement; inert: boolean }[] = []

function restoreBackground(): void {
  for (const { element, inert } of background) element.inert = inert
  background = []
}

watch(open, async (visible) => {
  await nextTick()
  const element = panel.value
  if (!element) return
  if (visible) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    background = [...element.parentElement?.children ?? []]
      .filter((sibling): sibling is HTMLElement => sibling instanceof HTMLElement && sibling !== element)
      .map((element) => ({ element, inert: element.inert }))
    for (const { element } of background) element.inert = true
    element.showPopover()
    element.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  } else {
    element.hidePopover()
    restoreBackground()
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  }
}, { flush: 'post' })

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    store.close()
    return
  }
  if (event.key !== 'Tab') return
  const elements = [...panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? []]
  const first = elements[0], last = elements.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

onBeforeUnmount(() => {
  restoreBackground()
  store.dispose()
})
</script>

<template>
  <div ref="panelRef" popover="manual" role="dialog" aria-modal="true" aria-label="路线长图导出" class="fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none border-0 bg-[#07110ff5] p-0 text-[#e7f5ee]" @keydown.stop="onKeydown">
    <div class="mx-auto h-full max-w-900px flex flex-col">
      <div class="shrink-0 flex items-center justify-between gap-12px border-b border-[#294539] p-16px">
        <div class="text-18px font-600">路线长图</div>
        <button type="button" class="min-h-44px rounded-6px border border-[#456354] bg-transparent px-16px text-inherit" @click="store.close">{{ status === 'running' ? '取消并关闭' : '关闭' }}</button>
      </div>
      <div v-if="status === 'running'" class="flex flex-1 flex-col items-center justify-center gap-16px p-24px" role="status" aria-live="polite">
        <div class="text-16px">{{ progress.message }}</div>
        <div class="text-14px text-[#afc6bb]">{{ progress.completed }} / {{ progress.total || '…' }} 张子图</div>
        <div class="text-center text-13px text-[#afc6bb]">正在生成完整长图和手机分卷，请保持页面打开。</div>
      </div>
      <div v-else-if="status === 'error' || status === 'cancelled'" class="flex flex-1 flex-col items-center justify-center gap-16px p-24px">
        <div role="alert" class="text-15px text-[#efc697]">{{ error || '生成已取消' }}</div>
        <button type="button" class="min-h-44px rounded-6px border-0 bg-[#65f1c2] px-24px text-[#08231d]" @click="store.retry">重新生成</button>
      </div>
      <template v-else-if="artifacts">
        <div class="shrink-0 border-b border-[#294539] p-16px">
          <div :title="artifacts.title" class="line-clamp-2 text-15px">{{ artifacts.title }}</div>
          <div class="mt-6px text-12px text-[#afc6bb]">{{ artifacts.width }} × {{ artifacts.height }} 像素 · {{ artifacts.columns }} 列 · {{ artifacts.pages.length }} 张手机分卷</div>
          <div class="mt-12px flex gap-8px overflow-x-auto whitespace-nowrap pb-4px">
            <a :href="artifacts.fullUrl" :download="`${artifacts.filename}.jpg`" class="min-h-44px flex shrink-0 items-center rounded-6px bg-[#65f1c2] px-16px text-14px text-[#08231d] no-underline">保存完整长图</a>
            <a v-for="(page, index) in artifacts.pages" :key="page.url" :href="page.url" :download="`${artifacts.filename}-${String(index + 1).padStart(2, '0')}.jpg`" class="min-h-44px flex shrink-0 items-center rounded-6px border border-[#456354] px-12px text-14px text-inherit no-underline">分卷 {{ index + 1 }}</a>
          </div>
          <div class="mt-10px text-12px text-[#afc6bb]">下方预览完整长图，可长按保存。长图打开较慢时，可保存手机分卷。</div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="路线长图预览">
          <img :src="artifacts.fullUrl" :width="artifacts.width" :height="artifacts.height" alt="完整路线长图" decoding="async" class="block h-auto w-full" />
        </div>
      </template>
    </div>
  </div>
</template>
