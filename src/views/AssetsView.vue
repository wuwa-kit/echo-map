<script setup lang="ts">
import WuSidebar from '../components/base/WuSidebar.vue'
import WuSidebarItem from '../components/base/WuSidebarItem.vue'
import WuSidebarDivider from '../components/base/WuSidebarDivider.vue'
import WuButton from '../components/base/WuButton.vue'
import { storeToRefs } from 'pinia'
import { useTitle } from '@vueuse/core'
import LibraryPageNavigation from '../components/LibraryPageNavigation.vue'
import AssetDetailDialog from '../components/AssetDetailDialog.vue'
import AssetVirtualGrid from '../components/AssetVirtualGrid.vue'
import WuSearchInput from '../components/base/WuSearchInput.vue'
import WuSvg from '../components/base/WuSvg.vue'
import { useAssetsRouteQuery } from '../composables/useAssetsRouteQuery.ts'
import { useAssetsStore } from '../stores/assets.ts'

const store = useAssetsStore()
const { dataset, loading, error, search, filters, filteredAssets, groups, categories, selectedAsset, selectedIndex } = storeToRefs(store)
const routeQuery = useAssetsRouteQuery()
useTitle('资产浏览 · 声巡')

function change(action: () => void): void {
  action()
}

function selectAsset(id: string): void {
  change(() => store.selectAsset(id))
}

</script>

<template>
  <div class="h-full flex flex-col bg-[#091311] text-[#eaf4ef]">
    <LibraryPageNavigation title="资产浏览" />

    <div v-if="loading" class="flex flex-1 flex-col items-center justify-center gap-[14px] p-[24px] text-center">
      <WuSvg name="loader" class="animate-spin text-[var(--accent)] [--wu-svg-h:30px]" />
      <div class="text-[16px]">正在整理官方资产</div>
      <div class="text-[13px] text-[var(--muted)]">读取已抓取的图标与地图资源清单…</div>
    </div>
    <div v-else-if="error" class="flex flex-1 flex-col items-center justify-center gap-[16px] p-[24px] text-center">
      <div class="text-[20px]">资产数据加载失败</div>
      <div class="max-w-full wrap-break-word text-[14px] text-[var(--muted)]">{{ error }}</div>
      <WuButton size="lg" tone="accent" @click="routeQuery.reload">重新加载</WuButton>
    </div>

    <div v-else-if="dataset" class="flex min-h-0 flex-1">
      <WuSidebar>
        <template v-for="category in categories" :key="category.id">
          <WuSidebarItem :text="category.name" :count="category.count" :selected="filters.category === category.id" @click="change(() => store.selectCategory(category.id))" />
          <WuSidebarDivider v-if="category.id === 'all'" />
        </template>
      </WuSidebar>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex shrink-0 flex-wrap gap-[12px] px-[20px] py-[16px]">
          <div class="min-w-[160px] flex-1"><WuSearchInput :model-value="search" placeholder="搜索名称、套装、类型 ID 或资源路径" @update:model-value="change(() => store.setSearch($event))" /></div>
        </div>
        <div v-if="!filteredAssets.length" class="flex flex-1 flex-col items-center justify-center gap-[12px] px-[20px] text-center">
          <div class="text-[18px]">没有匹配的资产</div>
          <WuButton size="lg" tone="accent" @click="change(store.resetFilters)">清除筛选</WuButton>
        </div>
        <AssetVirtualGrid v-else :groups="groups" :selected-id="filters.selectedId" :locked="!!selectedAsset" @select="selectAsset" />
      </div>
    </div>
    <AssetDetailDialog
      :asset="selectedAsset" :assets="filteredAssets" :selected-index="selectedIndex"
      @select="selectAsset" @navigate="change(() => store.selectAdjacentAsset($event))" @close="change(() => store.selectAsset(null))"
    />
  </div>
</template>
