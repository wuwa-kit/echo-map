import type { MapDataset, OfficialAsset } from './types.ts'
import { officialFloorTileUrl } from '../data/official-asset-urls.ts'

export const assetBrowserCategories = [
  { id: 'echo', name: '声骸图鉴' },
  { id: 'sonata', name: '合鸣效果' },
  { id: 'icons', name: '地图图标' },
  { id: 'tiles', name: '地图瓦片' },
] as const
export type AssetBrowserCategory = typeof assetBrowserCategories[number]['id']
export interface AssetGroup { id: string; name: string; categoryTitle?: string; assets: readonly OfficialAsset[] }
export function matchesAssetCategory(asset: OfficialAsset, category: AssetBrowserCategory | 'all'): boolean {
  const categories = category === 'icons' ? ['navigation', 'exploration', 'challenge', 'service']
    : category === 'tiles' ? ['tile', 'floor', 'gravity'] : [category]
  return category === 'all' || asset.categories.some(value => categories.includes(value))
}
export function groupBrowserAssets(assets: readonly OfficialAsset[], dataset: MapDataset, category: AssetBrowserCategory | 'all'): AssetGroup[] {
  if (category === 'all') return assetBrowserCategories.flatMap<AssetGroup>(entry => {
    const subset = assets.filter(asset => matchesAssetCategory(asset, entry.id))
    return entry.id === 'tiles'
      ? groupBrowserAssets(subset, dataset, 'tiles').map((group, index) => ({ ...group, categoryTitle: index === 0 ? entry.name : undefined }))
      : subset.length ? [{ id: entry.id, name: '', categoryTitle: entry.name, assets: subset }] : []
  })
  if (category !== 'tiles') return [{ id: category, name: '', assets }]
  const floorGroups = new Map<string, { id: string; name: string }>()
  for (const state of dataset.states) for (const layer of state.layeredMaps) for (const floor of layer.floors) for (const path of floor.tiles) {
    floorGroups.set(officialFloorTileUrl(dataset.source.mapResourceHash, state.id, path), { id: `${state.id}:floor:${layer.id}:${floor.id}`, name: `${state.name} · 分层 · ${layer.name} / ${floor.name}` })
  }
  const groups = new Map<string, { id: string; name: string; assets: OfficialAsset[] }>()
  for (const state of dataset.states) for (const kind of ['tile', 'floor', 'gravity'] as const) {
    for (const asset of assets) {
      if (asset.stateIds[0] !== state.id || asset.category !== kind) continue
      const info = floorGroups.get(asset.url) ?? { id: `${state.id}:${kind}`, name: `${state.name} · ${{ tile: '地表', floor: '分层', gravity: '反重力' }[kind]}` }
      let group = groups.get(info.id)
      if (!group) { group = { ...info, assets: [] }; groups.set(info.id, group) }
      group.assets.push(asset)
    }
  }
  return [...groups.values()]
}
