<script setup lang="ts">
import { computed } from 'vue'
import { assetCategories } from '../domain/official-assets.ts'
import type { OfficialAsset } from '../domain/types.ts'
import AssetImage from './AssetImage.vue'
import AssetThumbnailStrip from './AssetThumbnailStrip.vue'
import WuButton from './base/WuButton.vue'
import WuDialog from './base/WuDialog.vue'
import WuScrollArea from './base/WuScrollArea.vue'

const props = defineProps<{
  asset: OfficialAsset | null
  assets: readonly OfficialAsset[]
  selectedIndex: number
}>()
const emit = defineEmits<{
  close: []
  select: [id: string]
  navigate: [direction: -1 | 1]
}>()
// Preserve the last rendered content while WuDialog plays its closing transition.
const frame = computed<{
  asset: OfficialAsset
  assets: readonly OfficialAsset[]
  selectedIndex: number
} | undefined>((previous) => props.asset
  ? { asset: props.asset, assets: props.assets, selectedIndex: props.selectedIndex }
  : previous)
const categoryNames = computed(() => frame.value?.asset.categories.map((category) => assetCategories.find(({ id }) => id === category)?.name ?? category).join(' / '))
const adjacentAssets = computed(() => {
  const value = frame.value
  return value ? value.assets.slice(Math.max(0, value.selectedIndex - 1), value.selectedIndex + 2).filter(({ id }) => id !== value.asset.id) : []
})
const fetchedAt = computed(() => {
  const value = frame.value?.asset.fetchedAt ?? ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
})
</script>

<template>
  <WuDialog
    :open="!!props.asset"
    class="!h-[min(720px,calc(100dvh-48px))] !max-h-none !w-[min(1080px,calc(100vw-48px))] !max-w-none !rounded-[12px] !border-[var(--line)] !bg-[#0d1e18] !text-[#eaf4ef] max-sm:!m-0 max-sm:!h-dvh max-sm:!w-screen max-sm:!rounded-none"
    @dismiss-requested="emit('close')"
  >
    <div v-if="frame" class="h-full flex flex-col overflow-hidden">
      <div class="shrink-0 flex items-center justify-between gap-[12px] border-b border-[var(--line)] px-[16px] py-[12px] sm:px-[24px]">
        <div class="flex items-center gap-[12px]">
          <span class="text-[15px] font-medium">资产详情</span>
          <span class="text-[12px] text-[var(--muted)] tabular-nums">{{ frame.selectedIndex + 1 }} / {{ frame.assets.length }}</span>
        </div>
        <WuButton variant="ghost" icon="close" @click="emit('close')">关闭</WuButton>
      </div>

      <div class="min-h-0 flex flex-1 items-center gap-[16px] p-[12px] sm:p-[20px]">
        <div v-if="frame.assets.length > 1" class="hidden shrink-0 sm:block">
          <WuButton icon="chevron-left" icon-only size="lg" tooltip="上一项" :disabled="frame.selectedIndex <= 0" @click="emit('navigate', -1)" />
        </div>
        <WuScrollArea :key="frame.asset.id" class="h-full min-w-0 flex-1 rounded-[9px] border border-[var(--line)] bg-[#10251c]" content-class="p-[16px] sm:p-[24px]">
          <div class="grid min-w-0 gap-[20px] sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] sm:gap-[24px]">
            <div class="min-w-0 sm:sticky sm:top-0 sm:self-start">
              <AssetImage :key="frame.asset.url" :src="frame.asset.url" large eager class="mx-auto aspect-square w-full max-w-[220px] rounded-[8px] sm:max-w-[320px]" />
            </div>
            <div class="min-w-0 text-[12px] text-[#a9c1b4] leading-6">
              <div class="text-[11px] text-[var(--accent)]">{{ categoryNames }}</div>
              <div class="mt-[6px] wrap-break-word text-[22px] text-[#eaf4ef] font-semibold leading-8">{{ frame.asset.name }}</div>
              <div class="mt-[12px]">来源：<a :href="frame.asset.sourceUrl" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] underline underline-offset-3">{{ frame.asset.category === 'echo' || frame.asset.category === 'sonata' ? '库街区官方 Wiki' : '库街区官方地图' }} ↗</a></div>
              <div class="mt-[14px] flex flex-wrap gap-[6px]">
                <span v-for="tag in frame.asset.tags" :key="tag" class="max-w-full wrap-break-word rounded-[4px] bg-[#1b382b] px-[7px] py-[1px] text-[10px] text-[#b8d5c5]">{{ tag }}</span>
              </div>
              <div class="mt-[20px] border-t border-[var(--line)] pt-[16px] text-[11px] text-[var(--muted)]">
                <div>抓取时间：{{ fetchedAt }}</div>
                <div>快照引用：{{ frame.asset.recordCount.toLocaleString('zh-CN') }} 条记录</div>
                <div class="mt-[10px] break-all"><span class="text-[#759485]">来源 ID / 路径：</span>{{ frame.asset.referenceIds.join(' · ') }}</div>
                <div class="mt-[8px] break-all"><span class="text-[#759485]">原图地址：</span>{{ frame.asset.url }}</div>
              </div>
            </div>
          </div>
        </WuScrollArea>
        <div v-if="frame.assets.length > 1" class="hidden shrink-0 sm:block">
          <WuButton icon="chevron-right" icon-only size="lg" tooltip="下一项" :disabled="frame.selectedIndex >= frame.assets.length - 1" @click="emit('navigate', 1)" />
        </div>
      </div>

      <div class="shrink-0 border-t border-[var(--line)] p-[12px] pb-[max(12px,env(safe-area-inset-bottom))] sm:px-[24px] sm:py-[16px]">
        <div v-if="frame.assets.length > 1" class="mb-[12px] flex justify-between gap-[12px] sm:hidden">
          <WuButton icon="chevron-left" :disabled="frame.selectedIndex <= 0" @click="emit('navigate', -1)">上一项</WuButton>
          <WuButton icon="chevron-right" icon-position="end" :disabled="frame.selectedIndex >= frame.assets.length - 1" @click="emit('navigate', 1)">下一项</WuButton>
        </div>
        <AssetThumbnailStrip :assets="frame.assets" :selected-index="frame.selectedIndex" @select="emit('select', $event)" />
      </div>
    </div>
    <img v-for="adjacent in adjacentAssets" :key="adjacent.url" :src="adjacent.url" referrerpolicy="no-referrer" decoding="async" class="hidden" />
  </WuDialog>
</template>
