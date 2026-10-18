import { describe, expect, it } from 'vitest'
import { assetBrowserCategories, groupBrowserAssets, matchesAssetCategory } from '../src/domain/asset-browser.ts'
import { assetGroupWindow } from '../src/domain/asset-grid.ts'
import { buildOfficialAssets } from '../src/domain/official-assets.ts'
import { referenceDataset } from './fixtures/point-library.ts'

const assets = buildOfficialAssets(referenceDataset)
describe('merged asset browser', () => {
  it('keeps every tile exactly once under map and layer headings', () => {
    const tiles = assets.filter(asset => matchesAssetCategory(asset, 'tiles'))
    const groups = groupBrowserAssets(tiles, referenceDataset, 'tiles')
    expect(groups.length).toBeGreaterThan(0)
    expect(groups.every(group => group.name && group.assets.length)).toBe(true)
    expect(groups.flatMap(group => group.assets.map(asset => asset.id)).sort()).toEqual(tiles.map(asset => asset.id).sort())
    expect(assetBrowserCategories.map(category => category.id)).toEqual(['echo', 'sonata', 'icons', 'tiles'])
    expect(groupBrowserAssets([], referenceDataset, 'tiles')).toEqual([])
  })
  it('includes a multi-purpose icon only once in the merged icon grid', () => {
    const base = assets[0]
    if (!base) throw new Error('Missing fixture')
    const icon = { ...base, categories: ['navigation', 'exploration', 'challenge', 'service'] as const }
    const mutableIcon = { ...icon, categories: [...icon.categories] }
    expect(matchesAssetCategory(mutableIcon, 'icons')).toBe(true)
    expect(groupBrowserAssets([mutableIcon], referenceDataset, 'icons')[0]?.assets).toHaveLength(1)
  })
  it('virtualizes group headings and rows together without dropping the final tile', () => {
    const groups = groupBrowserAssets(assets.filter(asset => matchesAssetCategory(asset, 'tiles')), referenceDataset, 'tiles')
    const first = assetGroupWindow(groups, 1000, 0, 600)
    expect(first.visible[0]?.titleVisible).toBe(true)
    expect(first.visible.flatMap(entry => entry.assets).length).toBeLessThan(assets.length)
    const last = assetGroupWindow(groups, 1000, Math.max(0, first.height - 600), 600)
    expect(last.visible.flatMap(entry => entry.assets).at(-1)?.id).toBe(groups.at(-1)?.assets.at(-1)?.id)
    expect(assetGroupWindow([], 1000, 0, 600).height).toBe(0)
  })
})
