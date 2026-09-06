import { computed, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { freeze, produce } from 'immer'
import { loadMapDataset } from '../data/load.ts'
import { assetCategories, buildOfficialAssets, filterOfficialAssets } from '../domain/official-assets.ts'
import { officialAssetCategorySchema } from '../domain/schema.ts'
import type { MapDataset, OfficialAssetCategory } from '../domain/types.ts'

export const ASSET_PAGE_SIZE = 36

interface AssetBrowserState {
  category: OfficialAssetCategory | 'all'
  stateId: number | null
  page: number
  selectedId: string | null
}

export const useAssetsStore = defineStore('assets', () => {
  const dataset = shallowRef<MapDataset | null>(null)
  const loading = shallowRef(false)
  const error = shallowRef('')
  const search = shallowRef('')
  let pendingLoad: Promise<void> | null = null
  const filters = shallowRef<AssetBrowserState>(freeze({ category: 'all', stateId: null, page: 1, selectedId: null }))
  const assets = computed(() => freeze(dataset.value ? buildOfficialAssets(dataset.value) : [], true))
  const filteredAssets = computed(() => freeze(filterOfficialAssets(assets.value, filters.value.category, filters.value.stateId, search.value), true))
  const pageCount = computed(() => Math.max(1, Math.ceil(filteredAssets.value.length / ASSET_PAGE_SIZE)))
  const page = computed(() => Math.min(filters.value.page, pageCount.value))
  const pageAssets = computed(() => freeze(filteredAssets.value.slice((page.value - 1) * ASSET_PAGE_SIZE, page.value * ASSET_PAGE_SIZE)))
  const selectedAsset = computed(() => assets.value.find(({ id }) => id === filters.value.selectedId) ?? null)
  const categories = computed(() => {
    const scoped = filterOfficialAssets(assets.value, 'all', filters.value.stateId, search.value)
    return freeze([
      { id: 'all' as const, name: '全部资产', description: '浏览所有已收录资源', count: scoped.length },
      ...assetCategories.map((category) => ({ ...category, count: scoped.filter(({ category: id }) => id === category.id).length })),
    ], true)
  })

  function setDataset(value: MapDataset): void {
    dataset.value = freeze(value, true)
  }

  function load(): Promise<void> {
    if (pendingLoad) return pendingLoad
    loading.value = true
    error.value = ''
    pendingLoad = loadMapDataset()
      .then(({ dataset }) => setDataset(dataset))
      .catch((failure: unknown) => { error.value = failure instanceof Error ? failure.message : '官方资产数据加载失败' })
      .finally(() => {
        loading.value = false
        pendingLoad = null
      })
    return pendingLoad
  }

  function restoreQuery(query: Record<string, unknown>): void {
    const parsedCategory = officialAssetCategorySchema.safeParse(query.category)
    const category = parsedCategory.success ? parsedCategory.data : 'all'
    const requestedMap = typeof query.map === 'string' && /^\d+$/u.test(query.map) ? Number(query.map) : null
    const stateId = dataset.value?.states.some(({ id }) => id === requestedMap) ? requestedMap : null
    const requestedPage = typeof query.page === 'string' && /^\d+$/u.test(query.page) ? Number(query.page) : 1
    const count = filterOfficialAssets(assets.value, category, stateId, search.value).length
    filters.value = freeze({
      category, stateId,
      page: Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(requestedPage, Math.ceil(count / ASSET_PAGE_SIZE))) : 1,
      selectedId: typeof query.asset === 'string' && assets.value.some(({ id }) => id === query.asset) ? query.asset : null,
    })
  }

  function selectCategory(category: OfficialAssetCategory | 'all'): void {
    filters.value = produce(filters.value, (draft) => {
      draft.category = category
      draft.page = 1
      draft.selectedId = null
    })
  }

  function selectMap(value: string | number | null): void {
    filters.value = produce(filters.value, (draft) => {
      draft.stateId = dataset.value?.states.some(({ id }) => id === value) && typeof value === 'number' ? value : null
      draft.page = 1
      draft.selectedId = null
    })
  }

  function setSearch(value: string): void {
    search.value = value
    filters.value = produce(filters.value, (draft) => { draft.page = 1 })
  }

  function selectPage(value: number): void {
    if (!Number.isSafeInteger(value)) return
    filters.value = produce(filters.value, (draft) => { draft.page = Math.max(1, Math.min(value, pageCount.value)) })
  }

  function selectAsset(id: string | null): void {
    filters.value = produce(filters.value, (draft) => {
      draft.selectedId = assets.value.some((asset) => asset.id === id) ? id : null
    })
  }

  function resetFilters(): void {
    search.value = ''
    filters.value = freeze({ category: 'all', stateId: null, page: 1, selectedId: null })
  }

  return {
    dataset: shallowReadonly(dataset), loading: shallowReadonly(loading), error: shallowReadonly(error),
    search: shallowReadonly(search), filters: shallowReadonly(filters),
    assets, filteredAssets, pageCount, page, pageAssets, selectedAsset, categories,
    setDataset, load, restoreQuery, selectCategory, selectMap, setSearch, selectPage, selectAsset, resetFilters,
  }
})
