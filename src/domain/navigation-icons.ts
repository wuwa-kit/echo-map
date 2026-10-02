import type { OfficialAsset } from './types.ts'

export function navigationIconAssets(assets: readonly OfficialAsset[], search = ''): OfficialAsset[] {
  const query = search.trim().toLocaleLowerCase()
  return assets.filter((asset) => asset.categories.some((category) => ['navigation', 'exploration', 'challenge', 'service'].includes(category))
    && (!query || asset.name.split(' / ').some((name) => name.toLocaleLowerCase().includes(query))))
    .map((asset) => {
      if (!query) return asset
      const names = asset.name.split(' / ')
      const index = names.findIndex((name) => name.toLocaleLowerCase().includes(query))
      if (index <= 0) return asset
      return { ...asset, name: [names[index], ...names.filter((_, position) => position !== index)].join(' / ') }
    })
}
