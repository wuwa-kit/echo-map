import { officialFloorTileUrl, officialTileUrl, tilePreviewUrl } from '../data/official-asset-urls.ts'
import type { MapDataset, OfficialAsset, OfficialAssetCategory } from './types.ts'

export const assetCategories: { id: OfficialAssetCategory; name: string; description: string }[] = [
  { id: 'echo', name: '声骸图鉴', description: '官方 Wiki · C1 / C3 声骸' },
  { id: 'sonata', name: '合鸣效果', description: '官方 Wiki · 套装图标' },
  { id: 'navigation', name: '定位点图标', description: '官方地图 · 传送与功能地标' },
  { id: 'exploration', name: '探索', description: '官方地图 · 完整探索目录' },
  { id: 'challenge', name: '挑战', description: '官方地图 · 完整挑战目录' },
  { id: 'service', name: 'NPC及服务点', description: '官方地图 · 完整 NPC 与服务目录' },
  { id: 'tile', name: '地表瓦片', description: '官方地图 · 地表底图' },
  { id: 'floor', name: '分层瓦片', description: '官方地图 · 楼层底图' },
  { id: 'gravity', name: '反重力瓦片', description: '官方地图 · 反重力底图' },
]

export function buildOfficialAssets(dataset: MapDataset, mapAssets: readonly OfficialAsset[] = []): OfficialAsset[] {
  const assets = new Map<string, OfficialAsset>()
  // The catalog has already compared image pixels, including alternate CDN URLs.
  const catalogIdByUrl = new Map<string, string>()
  for (const asset of mapAssets) {
    for (const url of [asset.url, ...asset.tags]) {
      if (URL.parse(url)?.pathname.endsWith('.png')) catalogIdByUrl.set(url, asset.id)
    }
  }
  const { source } = dataset
  const stateNames = new Map(dataset.states.map(({ id, name }) => [id, name]))
  const sonataNames = new Map(dataset.sonatas.map(({ id, name }) => [id, name]))
  const groupNames = new Map(dataset.navigationPointGroups.map(({ id, name }) => [id, name]))
  const echoStates = new Map<string, Set<number>>()
  for (const point of dataset.echoLocations) {
    const states = echoStates.get(point.echoId) ?? new Set<number>()
    states.add(point.stateId)
    echoStates.set(point.echoId, states)
  }

  function add(category: OfficialAssetCategory, name: string, url: string, referenceId: string, stateIds: number[], tags: string[]): void {
    if (URL.parse(url)?.protocol !== 'https:') return
    const id = category === 'navigation' ? catalogIdByUrl.get(url) ?? `${category}:${url}` : `${category}:${url}`
    const existing = assets.get(id)
    if (existing) {
      existing.recordCount += 1
      existing.stateIds = [...new Set([...existing.stateIds, ...stateIds])]
      existing.referenceIds = [...new Set([...existing.referenceIds, referenceId])]
      existing.tags = [...new Set([...existing.tags, name, ...tags])]
      existing.name = [...new Set([...existing.name.split(' / '), name])].join(' / ')
      if (category === 'navigation') existing.tags = [...new Set([...existing.tags, url])]
      return
    }
    const isWiki = category === 'echo' || category === 'sonata'
    assets.set(id, {
      id, category, categories: [category], name, url,
      previewUrl: category === 'tile' || category === 'floor' || category === 'gravity' ? tilePreviewUrl(url, 320) : url,
      sourceUrl: category === 'echo' ? source.sourceUrls.echoCatalogue
        : category === 'sonata' ? source.sourceUrls.sonataCatalogue : source.sourceUrls.officialMap,
      fetchedAt: isWiki ? source.wikiFetchedAt : source.mapFetchedAt,
      stateIds: [...new Set(stateIds)],
      referenceIds: [referenceId],
      tags: [...new Set(tags.filter(Boolean))],
      recordCount: 1,
    })
  }

  for (const echo of dataset.echoes) {
    add('echo', echo.name, echo.iconUrl, String(echo.sourceId), [...echoStates.get(echo.id) ?? []], [
      `C${echo.cost}`, echo.id, ...echo.sonataIds.map((id) => sonataNames.get(id) ?? id),
    ])
  }
  for (const sonata of dataset.sonatas) {
    const states = dataset.echoes.filter(({ sonataIds }) => sonataIds.includes(sonata.id))
      .flatMap(({ id }) => [...echoStates.get(id) ?? []])
    add('sonata', sonata.name, sonata.iconUrl, String(sonata.sourceId), states, [sonata.id])
  }
  for (const point of dataset.navigationPoints) {
    add('navigation', point.typeName, point.iconUrl, point.typeId, [point.stateId], [
      groupNames.get(point.groupId) ?? point.groupId, point.catalogCategoryName,
    ])
  }
  for (const state of dataset.states) {
    for (const tilePath of state.gravityTiles) {
      add('gravity', `${state.name} · 反重力 · ${tilePath.split('/').at(-1)}`, officialFloorTileUrl(source.mapResourceHash, state.id, tilePath), tilePath, [state.id], [state.name, '反重力'])
    }
    for (const tileId of state.tileIds) {
      add('tile', tileId, officialTileUrl(source.mapResourceHash, state.id, tileId), tileId, [state.id], [state.name])
    }
    for (const layer of state.layeredMaps) {
      for (const floor of layer.floors) {
        for (const tilePath of floor.tiles) {
          add('floor', `${floor.name} · ${tilePath.split('/').at(-1)}`, officialFloorTileUrl(source.mapResourceHash, state.id, tilePath), tilePath, [state.id], [state.name, layer.name, floor.name, floor.id])
        }
      }
    }
  }
  for (const asset of mapAssets) {
    const existing = assets.get(asset.id)
    assets.set(asset.id, existing ? {
      ...asset,
      categories: [...new Set([...existing.categories, ...asset.categories])],
      name: [...new Set([...asset.name.split(' / '), ...existing.name.split(' / ')])].join(' / '),
      stateIds: [...new Set([...existing.stateIds, ...asset.stateIds])],
      referenceIds: [...new Set([...existing.referenceIds, ...asset.referenceIds])],
      tags: [...new Set([...existing.tags, ...asset.tags, existing.url, existing.sourceUrl])],
      recordCount: existing.recordCount + asset.recordCount,
    } : asset)
  }
  return [...assets.values()].map((asset) => ({
    ...asset,
    stateIds: asset.stateIds.toSorted((a, b) => a - b),
    tags: [...new Set([...asset.tags, ...asset.stateIds.map((id) => stateNames.get(id) ?? String(id))])],
  }))
}

export function filterOfficialAssets(assets: readonly OfficialAsset[], category: OfficialAssetCategory | 'all', stateId: number | null, search: string): OfficialAsset[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  return assets.filter((asset) => {
    if (category !== 'all' && !asset.categories.includes(category)) return false
    if (stateId !== null && !asset.stateIds.includes(stateId)) return false
    const text = [asset.name, asset.url, ...asset.referenceIds, ...asset.tags].join(' ').toLocaleLowerCase()
    return terms.every((term) => text.includes(term))
  })
}
