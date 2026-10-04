<script setup lang="ts">
import { buttonClasses } from '../components/base/button-styles.ts'
import WuButton from '../components/base/WuButton.vue'
import { storeToRefs } from 'pinia'
import { useTitle } from '@vueuse/core'
import { RouterLink } from 'vue-router'
import AssetDetailDialog from '../components/AssetDetailDialog.vue'
import AssetVirtualGrid from '../components/AssetVirtualGrid.vue'
import WuInput from '../components/base/WuInput.vue'
import WuOption from '../components/base/WuOption.vue'
import WuScrollArea from '../components/base/WuScrollArea.vue'
import WuSelect from '../components/base/WuSelect.vue'
import WuSvg from '../components/base/WuSvg.vue'
import { useAssetsRouteQuery } from '../composables/useAssetsRouteQuery.ts'
import { useAssetsStore } from '../stores/assets.ts'

const store = useAssetsStore()
const { dataset, loading, error, search, filters, filteredAssets, categories, selectedAsset, selectedIndex } = storeToRefs(store)
const routeQuery = useAssetsRouteQuery()
useTitle('官方资产库 · 声巡')

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function change(action: () => void): void {
  action()
  routeQuery.write()
}

function selectAsset(id: string): void {
  change(() => store.selectAsset(id))
}

</script>

<template>
  <div class="h-full flex flex-col bg-[#091311] text-[#eaf4ef]">
    <div class="z-10 shrink-0 border-b border-[var(--line)] bg-[#0c1915] px-[16px] sm:px-[28px]">
      <div class="mx-auto max-w-[1560px] min-h-[68px] flex flex-wrap items-center justify-between gap-[12px] py-[12px]">
        <div class="flex items-center gap-[12px]">
          <RouterLink to="/" class="font-serif text-[21px] text-[#f1faf5] tracking-[0.12em] no-underline">声巡</RouterLink>
          <span class="h-[18px] w-[1px] bg-[var(--line)]" />
          <span class="text-[13px] text-[#a6bdb3]">官方资产库</span>
        </div>
        <RouterLink to="/" :class="buttonClasses({ variant: 'ghost', tone: 'accent' })">
          <WuSvg name="chevron-left" class="[--wu-svg-h:var(--wu-button-icon-size)]" />返回地图
        </RouterLink>
      </div>
    </div>

    <div v-if="loading" class="flex flex-1 flex-col items-center justify-center gap-[14px] p-[24px] text-center">
      <span class="h-[30px] w-[30px] animate-spin rounded-full border-2 border-[#234d3c] border-t-[var(--accent)]" />
      <div class="text-[16px]">正在整理官方资产</div>
      <div class="text-[13px] text-[var(--muted)]">读取已抓取的图标与地图资源清单…</div>
    </div>
    <div v-else-if="error" class="flex flex-1 flex-col items-center justify-center gap-[16px] p-[24px] text-center">
      <div class="text-[20px]">资产数据加载失败</div>
      <div class="max-w-full wrap-break-word text-[14px] text-[var(--muted)]">{{ error }}</div>
      <WuButton size="lg" tone="accent" @click="routeQuery.reload">重新加载</WuButton>
    </div>

    <WuScrollArea v-else-if="dataset" class="min-h-0 flex-1" content-class="px-[16px] pt-[24px] pb-[32px] sm:px-[28px]" :viewport-class="selectedAsset ? 'overflow-y-hidden!' : ''">
      <div class="mx-auto max-w-[1560px]">
        <div class="grid items-start gap-[24px] lg:grid-cols-[220px_minmax(0,1fr)]">
          <div class="min-w-0">
            <div class="grid grid-cols-2 gap-[6px] sm:grid-cols-3 lg:grid-cols-1">
              <button v-for="category in categories" :key="category.id" type="button" class="min-h-[44px] flex cursor-pointer items-center justify-between gap-[8px] rounded-[7px] border px-[12px] text-left text-[13px] transition-colors" :class="filters.category === category.id ? 'border-[#377c60] bg-[#173b2d] text-[var(--accent)]' : 'border-transparent bg-transparent text-[#b5cbc0] hover:bg-[#142b22]'" @click="change(() => store.selectCategory(category.id))">
                <span>{{ category.name }}</span><span class="text-[11px] tabular-nums opacity-70">{{ category.count }}</span>
              </button>
            </div>
          </div>

          <div class="min-w-0">
            <div class="mb-[16px] flex flex-col gap-[12px] sm:flex-row">
              <div class="min-w-0 flex-1">
                <WuInput :model-value="search" type="search" placeholder="搜索名称、套装、类型 ID 或资源路径" @update:model-value="change(() => store.setSearch($event))" />
              </div>
              <div class="min-w-0 sm:w-[260px]">
                <WuSelect :model-value="filters.stateId" @update:model-value="change(() => store.selectMap($event))">
                  <WuOption :value="null">全部地图</WuOption>
                  <WuOption v-for="state in dataset.states" :key="state.id" :value="state.id">{{ state.name }}</WuOption>
                </WuSelect>
              </div>
            </div>

            <div v-if="!filteredAssets.length" class="flex flex-col items-center gap-[12px] rounded-[9px] border border-dashed border-[var(--line)] px-[20px] py-[64px] text-center">
              <div class="text-[18px]">没有匹配的资产</div>
              <div class="text-[13px] text-[var(--muted)]">试试其他关键词，或切换资源分类与地图范围。</div>
              <WuButton size="lg" tone="accent" @click="change(store.resetFilters)">清除筛选</WuButton>
            </div>
            <AssetVirtualGrid v-else :assets="filteredAssets" :selected-id="filters.selectedId" :locked="!!selectedAsset" @select="selectAsset" />

          </div>
        </div>

        <div class="mt-[32px] flex flex-wrap justify-between gap-[12px] border-t border-[var(--line)] pt-[18px] text-[10px] text-[#7e9a8b] leading-5">
          <div>Wiki 抓取 {{ formatDate(dataset.source.wikiFetchedAt) }}<span class="mx-[8px]">/</span>地图抓取 {{ formatDate(dataset.source.mapFetchedAt) }}</div>
          <div class="max-w-full break-all">地图资源版本 {{ dataset.source.mapResourceHash }}</div>
          <div class="w-full">资源 © 库街区 / 鸣潮。此页为项目已收录数据的浏览视图；数据快照中的官方坐标不代表人工实测 XYZ。</div>
        </div>
      </div>
    </WuScrollArea>
    <AssetDetailDialog
      :asset="selectedAsset" :assets="filteredAssets" :selected-index="selectedIndex"
      @select="selectAsset" @navigate="change(() => store.selectAdjacentAsset($event))" @close="change(() => store.selectAsset(null))"
    />
  </div>
</template>
