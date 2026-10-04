import { computed, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { freeze, produce } from 'immer'
import { loadMapAssetCatalog, loadMapDataset } from '../data/load.ts'
import { assetCategories, buildOfficialAssets, filterOfficialAssets } from '../domain/official-assets.ts'
import { officialAssetCategorySchema } from '../domain/schema.ts'
import type { MapDataset, OfficialAsset, OfficialAssetCategory } from '../domain/types.ts'

interface AssetBrowserState {
  category: OfficialAssetCategory | 'all'
  stateId: number | null
  selectedId: string | null
}

export const useAssetsStore = defineStore('assets', () => {
  const dataset = shallowRef<MapDataset | null>(null)
  const mapAssets = shallowRef<OfficialAsset[]>([])
  const loading = shallowRef(false)
  const error = shallowRef('')
  const search = shallowRef('')
  let pendingLoad: Promise<void> | null = null
  const filters = shallowRef<AssetBrowserState>(freeze({ category: 'all', stateId: null, selectedId: null }))
  const category = computed(() => filters.value.category)
  const stateId = computed(() => filters.value.stateId)
  const assets = computed(() => freeze(dataset.value ? buildOfficialAssets(dataset.value, mapAssets.value) : [], true))
  const filteredAssets = computed(() => freeze(filterOfficialAssets(assets.value, category.value, stateId.value, search.value), true))
  const selectedIndex = computed(() => filteredAssets.value.findIndex(({ id }) => id === filters.value.selectedId))
  const selectedAsset = computed(() => filteredAssets.value[selectedIndex.value] ?? null)
  const categories = computed(() => {
    const scoped = filterOfficialAssets(assets.value, 'all', stateId.value, search.value)
    return freeze([
      { id: 'all' as const, name: '全部资产', description: '浏览所有已收录资源', count: scoped.length },
      ...assetCategories.map((category) => ({ ...category, count: scoped.filter((asset) => asset.categories.includes(category.id)).length })),
    ], true)
  })

  function setDataset(value: MapDataset): void {
    dataset.value = freeze(value, true)
  }

  function load(): Promise<void> {
    if (pendingLoad) return pendingLoad
    loading.value = true
    error.value = ''
    pendingLoad = Promise.all([loadMapDataset(), loadMapAssetCatalog()])
      .then(([{ dataset }, catalog]) => {
        setDataset(dataset)
        mapAssets.value = freeze(catalog.assets, true)
      })
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
    const scoped = filterOfficialAssets(assets.value, category, stateId, search.value)
    filters.value = freeze({
      category, stateId,
      selectedId: typeof query.asset === 'string' && scoped.some(({ id }) => id === query.asset) ? query.asset : null,
    })
  }

  function selectCategory(category: OfficialAssetCategory | 'all'): void {
    filters.value = produce(filters.value, (draft) => {
      draft.category = category
      draft.selectedId = null
    })
  }

  function selectMap(value: string | number | null): void {
    filters.value = produce(filters.value, (draft) => {
      draft.stateId = dataset.value?.states.some(({ id }) => id === value) && typeof value === 'number' ? value : null
      draft.selectedId = null
    })
  }

  function setSearch(value: string): void {
    search.value = value
    if (selectedIndex.value < 0) selectAsset(null)
  }

  function selectAsset(id: string | null): void {
    filters.value = produce(filters.value, (draft) => {
      draft.selectedId = filteredAssets.value.some((asset) => asset.id === id) ? id : null
    })
  }

  function selectAdjacentAsset(direction: -1 | 1): void {
    if (selectedIndex.value < 0) return
    const asset = filteredAssets.value[selectedIndex.value + direction]
    if (asset) selectAsset(asset.id)
  }

  function resetFilters(): void {
    search.value = ''
    filters.value = freeze({ category: 'all', stateId: null, selectedId: null })
  }

  return {
    dataset: shallowReadonly(dataset), loading: shallowReadonly(loading), error: shallowReadonly(error),
    search: shallowReadonly(search), filters: shallowReadonly(filters),
    assets, filteredAssets, selectedAsset, selectedIndex, categories,
    setDataset, load, restoreQuery, selectCategory, selectMap, setSearch, selectAsset, selectAdjacentAsset, resetFilters,
  }
})
