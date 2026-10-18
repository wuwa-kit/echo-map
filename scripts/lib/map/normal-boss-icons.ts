import type { OfficialMapAssetCatalog } from '../../../src/domain/types.ts'
import previousIcons from '../../../data/generated/map-normal-boss-icons.json' with { type: 'json' }

export function mapNormalBossIcons(catalog: OfficialMapAssetCatalog) {
  return [{ sourceId: '340000150', replacesIconId: 'wiki-echo-17409' }].map(({ sourceId, replacesIconId }) => {
    const asset = catalog.assets.find(asset => asset.referenceIds.includes(sourceId) && asset.categories.includes('navigation'))
    if (!asset) {
      const previous = previousIcons.find(icon => icon.replacesIconId === replacesIconId)
      if (!previous) throw new Error(`官方地图缺少 BOSS 图标：${sourceId}`)
      return { ...previous, source: 'map' as const }
    }
    return { id: `map-boss-${sourceId}`, name: asset.name, url: asset.url, source: 'map' as const, replacesIconId }
  })
}
