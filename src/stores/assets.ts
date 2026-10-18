import { computed, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { freeze, produce } from 'immer'
import { loadMapAssetCatalog, loadMapDataset } from '../data/load.ts'
import { buildOfficialAssets, filterOfficialAssets } from '../domain/official-assets.ts'
import { assetBrowserCategories, matchesAssetCategory, groupBrowserAssets } from '../domain/asset-browser.ts'
import type { AssetBrowserCategory } from '../domain/asset-browser.ts'
import type { MapDataset, OfficialAsset } from '../domain/types.ts'

interface AssetBrowserState {
  category: AssetBrowserCategory | 'all'
  selectedId: string | null
}

export const useAssetsStore = defineStore('assets', () => {
  const dataset = shallowRef<MapDataset | null>(null)
  const mapAssets = shallowRef<OfficialAsset[]>([])
  const loading = shallowRef(false)
  const error = shallowRef('')
  const search = shallowRef('')
  let pendingLoad: Promise<void> | null = null
  const queryBinding = shallowRef<{ read: () => Record<string, unknown>; write: (query: Record<string, unknown>) => void } | null>(null)
  function bindQuery(binding: NonNullable<typeof queryBinding.value>): void { queryBinding.value = binding }
  function unbindQuery(binding: NonNullable<typeof queryBinding.value>): void { if (queryBinding.value === binding) queryBinding.value = null }
  const filters = computed<AssetBrowserState>({
    get: () => parseQuery(queryBinding.value?.read() ?? {}),
    set: state => queryBinding.value?.write({ category: state.category, asset: state.selectedId ?? undefined }),
  })
  const category = computed(() => filters.value.category)
  const assets = computed(() => freeze(dataset.value ? buildOfficialAssets(dataset.value, mapAssets.value) : [], true))
  const filteredAssets = computed(() => freeze(filterOfficialAssets(assets.value, 'all', null, search.value).filter(asset => matchesAssetCategory(asset, category.value)), true))
  const groups = computed(() => dataset.value ? groupBrowserAssets(filteredAssets.value, dataset.value, category.value) : [])
  const selectedIndex = computed(() => filteredAssets.value.findIndex(({ id }) => id === filters.value.selectedId))
  const selectedAsset = computed(() => filteredAssets.value[selectedIndex.value] ?? null)
  const categories = computed(() => {
    const scoped = filterOfficialAssets(assets.value, 'all', null, search.value)
    return freeze([
      { id: 'all' as const, name: '全部资产', description: '浏览所有已收录资源', count: scoped.length },
      ...assetBrowserCategories.map((category) => ({ ...category, count: scoped.filter(asset => matchesAssetCategory(asset, category.id)).length })),
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

  function parseQuery(query: Record<string, unknown>): AssetBrowserState {
    const category = assetBrowserCategories.find(category => category.id === query.category)?.id ?? 'all'
    const scoped = filterOfficialAssets(assets.value, 'all', null, search.value).filter(asset => matchesAssetCategory(asset, category))
    return {
      category,
      selectedId: typeof query.asset === 'string' && scoped.some(({ id }) => id === query.asset) ? query.asset : null,
    }
  }

  function selectCategory(category: AssetBrowserCategory | 'all'): void {
    filters.value = produce(filters.value, (draft) => {
      draft.category = category
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
    filters.value = freeze({ category: 'all', selectedId: null })
  }

  return {
    dataset: shallowReadonly(dataset), loading: shallowReadonly(loading), error: shallowReadonly(error),
    search: shallowReadonly(search), filters: shallowReadonly(filters),
    assets, filteredAssets, groups, selectedAsset, selectedIndex, categories,
    setDataset, load, bindQuery, unbindQuery, selectCategory, setSearch, selectAsset, selectAdjacentAsset, resetFilters,
  }
})
