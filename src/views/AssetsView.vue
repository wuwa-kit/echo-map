<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useTitle } from '@vueuse/core'
import { RouterLink } from 'vue-router'
import AssetImage from '../components/AssetImage.vue'
import WuInput from '../components/base/WuInput.vue'
import WuOption from '../components/base/WuOption.vue'
import WuScrollArea from '../components/base/WuScrollArea.vue'
import WuSelect from '../components/base/WuSelect.vue'
import WuSvg from '../components/base/WuSvg.vue'
import { useAssetsRouteQuery } from '../composables/useAssetsRouteQuery.ts'
import { assetCategories } from '../domain/official-assets.ts'
import type { OfficialAssetCategory } from '../domain/types.ts'
import { ASSET_PAGE_SIZE, useAssetsStore } from '../stores/assets.ts'

const store = useAssetsStore()
const { dataset, loading, error, search, filters, assets, filteredAssets, categories, page, pageCount, pageAssets, selectedAsset } = storeToRefs(store)
const routeQuery = useAssetsRouteQuery()
useTitle('官方资产库 · 声巡')
const details = useTemplateRef<HTMLElement>('detailsRef')
const results = useTemplateRef<HTMLElement>('resultsRef')
const activeCategory = computed(() => categories.value.find(({ id }) => id === filters.value.category))
const summary = computed(() => [
  { label: '图标资源', count: assets.value.filter(({ category }) => category !== 'tile' && category !== 'floor' && category !== 'gravity').length },
  { label: '底图瓦片', count: assets.value.filter(({ category }) => category === 'tile' || category === 'floor' || category === 'gravity').length },
  { label: '地图范围', count: dataset.value?.states.length ?? 0 },
  { label: '分层楼层', count: dataset.value?.states.reduce((sum, state) => sum + state.layeredMaps.reduce((count, layer) => count + layer.floors.length, 0), 0) ?? 0 },
])
const dataDownloads = [
  { file: 'map-data.json', label: '地图数据' },
  { file: 'catalog-data.json', label: '声骸套装与图标' },
  { file: 'official-points.json', label: '官方点位' },
  { file: 'custom-points.json', label: '人工点位' },
]

function categoryName(category: OfficialAssetCategory): string {
  return assetCategories.find(({ id }) => id === category)?.name ?? category
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function change(action: () => void): void {
  action()
  routeQuery.write()
}

async function selectAsset(id: string): Promise<void> {
  change(() => store.selectAsset(id))
  await nextTick()
  details.value?.scrollIntoView({ block: 'nearest' })
}

async function selectPage(value: number): Promise<void> {
  change(() => store.selectPage(value))
  await nextTick()
  results.value?.scrollIntoView({ block: 'start' })
}
</script>

<template>
  <div class="h-full flex flex-col bg-[#091311] text-[#eaf4ef]">
    <div class="z-10 shrink-0 border-b border-[var(--line)] bg-[#0c1915] px-16px sm:px-28px">
      <div class="mx-auto max-w-1560px min-h-68px flex flex-wrap items-center justify-between gap-12px py-12px">
        <div class="flex items-center gap-12px">
          <RouterLink to="/" class="font-serif text-21px text-[#f1faf5] tracking-[0.12em] no-underline">声巡</RouterLink>
          <span class="h-18px w-1px bg-[var(--line)]" />
          <span class="text-13px text-[#a6bdb3]">官方资产库</span>
        </div>
        <RouterLink to="/" class="min-h-40px inline-flex items-center gap-8px rounded-7px px-12px text-13px text-[var(--accent)] no-underline hover:bg-[#19372b]">
          <WuSvg name="chevron-right" class="rotate-180 [--wu-svg-h:14px]" />返回地图
        </RouterLink>
      </div>
    </div>

    <div v-if="loading" class="flex flex-1 flex-col items-center justify-center gap-14px p-24px text-center">
      <span class="h-30px w-30px animate-spin rounded-full border-2 border-[#234d3c] border-t-[var(--accent)]" />
      <div class="text-16px">正在整理官方资产</div>
      <div class="text-13px text-[var(--muted)]">读取已抓取的图标与地图资源清单…</div>
    </div>
    <div v-else-if="error" class="flex flex-1 flex-col items-center justify-center gap-16px p-24px text-center">
      <div class="text-20px">资产数据加载失败</div>
      <div class="max-w-full break-words text-14px text-[var(--muted)]">{{ error }}</div>
      <button type="button" class="min-h-44px cursor-pointer rounded-7px border border-[var(--accent)] bg-transparent px-20px text-[var(--accent)]" @click="routeQuery.reload">重新加载</button>
    </div>

    <WuScrollArea v-else-if="dataset" class="min-h-0 flex-1" content-class="px-16px pb-32px sm:px-28px">
      <div class="mx-auto max-w-1560px">
        <div class="flex flex-wrap items-end justify-between gap-20px py-28px sm:py-36px">
          <div>
            <div class="mb-10px text-10px text-[var(--accent)] font-600 tracking-[0.24em]">WUTHERING WAVES / ASSET ARCHIVE</div>
            <div class="text-28px font-600 tracking-[0.03em] sm:text-34px">官方资产库</div>
            <div class="mt-10px max-w-660px text-13px text-[var(--muted)] leading-6">浏览已从库街区 Wiki 与官方地图抓取的资源清单。按分类和 URL 整理，每份素材保留来源与关联信息。</div>
          </div>
          <div class="flex flex-wrap gap-8px">
            <a v-for="item in dataDownloads" :key="item.file" :href="`/data/${item.file}`" :download="item.file" class="min-h-42px inline-flex items-center rounded-7px border border-[var(--line)] bg-[#13271f] px-16px text-13px text-[#d5e8df] no-underline hover:border-[var(--accent)]">{{ item.label }} ↗</a>
          </div>
        </div>

        <div class="mb-28px grid grid-cols-2 gap-10px lg:grid-cols-4">
          <div v-for="item in summary" :key="item.label" class="rounded-9px border border-[var(--line)] bg-[#0e1f19] px-18px py-16px">
            <div class="text-11px text-[var(--muted)]">{{ item.label }}</div>
            <div class="mt-8px text-26px font-500 tabular-nums">{{ item.count.toLocaleString('zh-CN') }}</div>
          </div>
        </div>

        <div class="grid items-start gap-24px lg:grid-cols-[220px_minmax(0,1fr)]">
          <div class="min-w-0">
            <div class="mb-12px text-11px text-[#829d91] tracking-[0.12em]">资源分类</div>
            <div class="grid grid-cols-2 gap-6px sm:grid-cols-3 lg:grid-cols-1">
              <button v-for="category in categories" :key="category.id" type="button" class="min-h-44px flex cursor-pointer items-center justify-between gap-8px rounded-7px border px-12px text-left text-13px transition-colors" :class="filters.category === category.id ? 'border-[#377c60] bg-[#173b2d] text-[var(--accent)]' : 'border-transparent bg-transparent text-[#b5cbc0] hover:bg-[#142b22]'" @click="change(() => store.selectCategory(category.id))">
                <span>{{ category.name }}</span><span class="text-11px tabular-nums opacity-70">{{ category.count }}</span>
              </button>
            </div>
            <div class="mt-24px hidden rounded-9px border border-[var(--line)] bg-[#0e1c17] p-14px text-11px text-[var(--muted)] leading-6 lg:block">
              <div class="mb-8px text-12px text-[#d5e8df]">关于这份清单</div>
              <div>展示当前项目收录的资产；声骸图鉴限定为有合鸣套装的 C1 / C3。</div>
              <div class="mt-8px">同分类下相同 URL 合并展示。原图来自官方 CDN，预览按需加载。</div>
              <div class="mt-8px">地图筛选依据快照中的关联点位，不代表游戏中的完整分布。</div>
            </div>
          </div>

          <div class="min-w-0">
            <div class="mb-16px flex flex-col gap-12px sm:flex-row">
              <div class="min-w-0 flex-1">
                <WuInput :model-value="search" type="search" placeholder="搜索名称、套装、类型 ID 或资源路径" @update:model-value="change(() => store.setSearch($event))" />
              </div>
              <div class="min-w-0 sm:w-260px">
                <WuSelect :model-value="filters.stateId" @update:model-value="change(() => store.selectMap($event))">
                  <WuOption :value="null">全部地图</WuOption>
                  <WuOption v-for="state in dataset.states" :key="state.id" :value="state.id">{{ state.name }}</WuOption>
                </WuSelect>
              </div>
            </div>

            <div v-if="selectedAsset" ref="detailsRef" class="mb-24px overflow-hidden rounded-9px border border-[#377c60] bg-[#10251c]">
              <div class="flex items-center justify-between gap-12px border-b border-[var(--line)] px-16px py-4px">
                <span class="text-12px text-[var(--accent)]">资产详情 / {{ categoryName(selectedAsset.category) }}</span>
                <button type="button" class="min-h-40px cursor-pointer rounded-5px border-0 bg-transparent px-8px text-13px text-[#b5cbc0] hover:text-white" @click="change(() => store.selectAsset(null))">收起详情</button>
              </div>
              <div class="grid gap-18px p-16px sm:grid-cols-[180px_minmax(0,1fr)]">
                <div>
                  <AssetImage :key="selectedAsset.url" :src="selectedAsset.url" large class="aspect-square w-full rounded-7px" />
                  <a :href="selectedAsset.url" target="_blank" rel="noopener noreferrer" class="mt-10px min-h-40px flex items-center justify-center rounded-6px border border-[#377c60] text-13px text-[var(--accent)] no-underline hover:bg-[#193b2c]">打开原图 ↗</a>
                </div>
                <div class="min-w-0 text-12px text-[#a9c1b4] leading-6">
                  <div class="break-words text-20px text-[#eaf4ef] font-600">{{ selectedAsset.name }}</div>
                  <div class="mt-8px">来源：<a :href="selectedAsset.sourceUrl" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] underline underline-offset-3">{{ selectedAsset.category === 'echo' || selectedAsset.category === 'sonata' ? '库街区官方 Wiki' : '库街区官方地图' }} ↗</a></div>
                  <div>抓取时间：{{ formatDate(selectedAsset.fetchedAt) }}</div>
                  <div>快照引用：{{ selectedAsset.recordCount.toLocaleString('zh-CN') }} 条记录</div>
                  <div class="mt-8px break-all"><span class="text-[#759485]">来源 ID / 路径：</span>{{ selectedAsset.referenceIds.join(' · ') }}</div>
                  <div class="mt-6px break-all"><span class="text-[#759485]">原图地址：</span>{{ selectedAsset.url }}</div>
                  <div class="mt-10px flex flex-wrap gap-5px">
                    <span v-for="tag in selectedAsset.tags" :key="tag" class="max-w-full break-words rounded-4px bg-[#1b382b] px-7px py-1px text-10px text-[#b8d5c5]">{{ tag }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div ref="resultsRef" class="mb-16px flex flex-wrap items-end justify-between gap-10px">
              <div>
                <div class="text-18px font-500">{{ activeCategory?.name }}</div>
                <div class="mt-4px text-11px text-[var(--muted)]">{{ activeCategory?.description }}</div>
              </div>
              <span class="text-12px text-[var(--muted)]">{{ filteredAssets.length.toLocaleString('zh-CN') }} 项资产</span>
            </div>

            <div v-if="!filteredAssets.length" class="flex flex-col items-center gap-12px rounded-9px border border-dashed border-[var(--line)] px-20px py-64px text-center">
              <div class="text-18px">没有匹配的资产</div>
              <div class="text-13px text-[var(--muted)]">试试其他关键词，或切换资源分类与地图范围。</div>
              <button type="button" class="min-h-44px cursor-pointer rounded-7px border border-[#377c60] bg-[#173b2d] px-18px text-13px text-[var(--accent)]" @click="change(store.resetFilters)">清除筛选</button>
            </div>
            <div v-else class="grid grid-cols-2 gap-10px sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              <button v-for="item in pageAssets" :key="item.id" type="button" class="group min-w-0 cursor-pointer overflow-hidden rounded-8px border bg-[#0f211a] p-0 text-left transition-colors hover:border-[#4f9d78]" :class="selectedAsset?.id === item.id ? 'border-[var(--accent)]' : 'border-[var(--line)]'" @click="selectAsset(item.id)">
                <AssetImage :key="item.previewUrl" :src="item.previewUrl" class="aspect-[4/3] w-full" />
                <div class="p-12px">
                  <div class="truncate text-13px text-[#dceee3]" :title="item.name">{{ item.name }}</div>
                  <div class="mt-7px flex items-center justify-between gap-4px text-10px text-[var(--muted)]">
                    <span>{{ categoryName(item.category) }}</span>
                    <WuSvg name="chevron-right" class="text-[#6e9a83] [--wu-svg-h:12px] group-hover:text-[var(--accent)]" />
                  </div>
                </div>
              </button>
            </div>

            <div v-if="filteredAssets.length" class="mt-20px flex flex-wrap items-center justify-between gap-14px border-t border-[var(--line)] pt-16px text-12px text-[var(--muted)]">
              <span>第 {{ (page - 1) * ASSET_PAGE_SIZE + 1 }}–{{ Math.min(page * ASSET_PAGE_SIZE, filteredAssets.length) }} 项 / 共 {{ filteredAssets.length }} 项</span>
              <div class="flex items-center gap-12px">
                <button type="button" class="min-h-40px cursor-pointer rounded-6px border border-[var(--line)] bg-[#13271f] px-12px text-[#cee5d8] disabled:cursor-not-allowed disabled:opacity-35" :disabled="page === 1" @click="selectPage(page - 1)">上一页</button>
                <span class="tabular-nums">{{ page }} / {{ pageCount }}</span>
                <button type="button" class="min-h-40px cursor-pointer rounded-6px border border-[var(--line)] bg-[#13271f] px-12px text-[#cee5d8] disabled:cursor-not-allowed disabled:opacity-35" :disabled="page === pageCount" @click="selectPage(page + 1)">下一页</button>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-32px flex flex-wrap justify-between gap-12px border-t border-[var(--line)] pt-18px text-10px text-[#7e9a8b] leading-5">
          <div>Wiki 抓取 {{ formatDate(dataset.source.wikiFetchedAt) }}<span class="mx-8px">/</span>地图抓取 {{ formatDate(dataset.source.mapFetchedAt) }}</div>
          <div class="max-w-full break-all">地图资源版本 {{ dataset.source.mapResourceHash }}</div>
          <div class="w-full">资源 © 库街区 / 鸣潮。此页为项目已收录数据的浏览视图；数据快照中的官方坐标不代表人工实测 XYZ。</div>
        </div>
      </div>
    </WuScrollArea>
  </div>
</template>
