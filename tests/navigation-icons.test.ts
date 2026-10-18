import { describe, expect, it } from 'vitest'
import { navigationIconCatalog } from '../src/domain/navigation-icon-catalog.ts'
import { navigationIconById, navigationPointIconUrl, navigationTypeIcons } from '../src/domain/navigation-icons.ts'
import { navigationPointTypes } from '../src/domain/navigation-point-types.ts'
import { authoredPointMapDisplay, parsePointLibrary } from '../src/domain/point-library.ts'
import { referenceDataset } from './fixtures/point-library.ts'
import { officialNavigationPointType } from '../scripts/lib/map/navigation-types.ts'

const emptyNavigationDataset = { ...referenceDataset, navigationPoints: [], navigationPointGroups: [] }

describe('local navigation icon picker', () => {
  it('offers the CDN missing icon under the other type and preserves it through saving and map display', async () => {
    const icon = navigationTypeIcons('unclassified', '图标未找到')[0]
    if (!icon) throw new Error('缺少图标未找到选项')
    expect(navigationTypeIcons('unclassified')).toContainEqual(icon)
    expect(navigationPointTypes).not.toHaveProperty('icon-not-found')
    expect(new URL(icon.url).hostname).toBe('prod-alicdn-community.kurobbs.com')
    const point = {
      gravityType: null, id: 'missing-artwork', kind: 'navigation' as const,
      stateId: 8, levelId: null, coordinate: { x: 1, y: 2, z: 3 },
      name: '待补充图标的地标', pointType: 'unclassified' as const, navigationKind: 'landmark' as const,
      mode: 'landmark' as const, iconId: icon.id,
    }
    const library = parsePointLibrary({ version: 1, points: [point] }, emptyNavigationDataset, 'manual')
    const saved = library.points[0]
    if (!saved) throw new Error('缺少保存点位')
    expect(saved).toMatchObject({ iconId: icon.id })
    expect(authoredPointMapDisplay(saved, emptyNavigationDataset)?.location.iconUrl).toBe(icon.url)
    expect(navigationTypeIcons('small-beacon')).not.toContain(icon)
  })

  it('resolves configured and custom choices without any official point data', () => {
    expect(navigationTypeIcons(undefined).length).toBeGreaterThan(0)
    expect(navigationTypeIcons('service')).toHaveLength(navigationPointTypes.service.icons.length)
    expect(navigationTypeIcons('small-beacon')).toHaveLength(1)
    expect(navigationTypeIcons('echo-settlement')).toHaveLength(3)
    expect(new Set(navigationIconCatalog.map(({ id }) => id)).size).toBe(navigationIconCatalog.length)
    expect(new Set(navigationIconCatalog.map(({ url }) => url)).size).toBe(navigationIconCatalog.length)
  })

  it('excludes typed icons from unset choices, searches, and recent icons', () => {
    const typedIds = new Set(Object.values(navigationPointTypes).flatMap(({ icons }) => icons))
    const icons = navigationTypeIcons(undefined)
    expect(icons.every(({ id }) => !typedIds.has(id))).toBe(true)
    expect(icons.length + typedIds.size).toBe(navigationIconCatalog.length)
    expect(navigationTypeIcons(undefined, '信标', [...typedIds])).toEqual([])
    expect(navigationTypeIcons(undefined, '', [...typedIds])).toEqual(icons)
    expect(navigationTypeIcons('unclassified', '贡多拉站台').map(({ name }) => name)).toEqual(['贡多拉站台'])
  })

  it.each([
    ['先行公约', ['SP_IconMap_Play_07_UI', 'SP_IconMap_Play_07_UI_1']],
    ['玄方坚盾基金', ['3510007', '3510008']],
    ['补弦留歌', ['SP_IconMap_Play_13_UI']],
    ['留声珍藏', ['SP_IconMap_Play_25_UI']],
    ['载具系泊场', ['381038']],
    ['深空文献中心', ['381031']],
  ] as const)('maps official %s types to services independently of editable icon names', (_name, officialIds) => {
    for (const id of officialIds) expect(officialNavigationPointType(id)).toBe('service')
  })

  it.each(navigationPointTypes.service.icons)('offers service icon %s by its current name and fixed ID', iconId => {
    const icon = navigationIconById(iconId)
    if (!icon) throw new Error(`缺少服务设施图标：${iconId}`)
    const name = icon.name
    expect(navigationTypeIcons('service', name).some(item => item.id === iconId)).toBe(true)
    expect(navigationTypeIcons('service', iconId).some(item => item.id === iconId)).toBe(true)
    expect(navigationTypeIcons(undefined, name, [iconId]).some(item => item.id === iconId)).toBe(false)
    const point = {
      gravityType: null, id: 'service-icon', kind: 'navigation' as const,
      stateId: 8, levelId: null, coordinate: { x: 1, y: 2, z: 3 },
      name, pointType: 'service' as const, navigationKind: 'service' as const,
      mode: 'landmark' as const, iconId: icon.id,
    }
    const saved = parsePointLibrary({ version: 1, points: [point] }, emptyNavigationDataset, 'manual').points[0]
    if (!saved) throw new Error('缺少保存点位')
    expect(saved).toMatchObject({ pointType: 'service', iconId: icon.id, mode: 'landmark' })
    expect(authoredPointMapDisplay(saved, emptyNavigationDataset)?.location.iconUrl).toBe(icon.url)
  })

  it.each(['unclassified', 'service'] as const)('searches every name of a shared icon for %s without changing its stored label', (pointType) => {
    const icon = navigationTypeIcons(pointType).find(({ name }) => name.split(' / ').length > 1)
    if (!icon) throw new Error('需要多名称图标')
    const original = icon.name
    for (const name of icon.name.split(' / ')) {
      expect(navigationTypeIcons(pointType, name).some(({ id }) => id === icon.id)).toBe(true)
    }
    expect(icon.name).toBe(original)
    expect(navigationTypeIcons(pointType, '不存在的图标名称xyz')).toEqual([])
  })

  it('keeps a selected icon valid and visible after all official navigation is removed', () => {
    const icon = navigationTypeIcons('small-beacon')[0]
    if (!icon) throw new Error('需要信标图标')
    const point = {
      gravityType: null, id: 'local-icon', kind: 'navigation' as const,
      stateId: 8, levelId: null, coordinate: { x: 1, y: 2, z: 3 },
      name: '小型信标', pointType: 'small-beacon' as const, navigationKind: 'beacon' as const, mode: 'fast-travel' as const, note: '', iconId: icon.id,
    }
    const library = parsePointLibrary({ version: 1, points: [point] }, emptyNavigationDataset, 'manual')
    const saved = library.points[0]
    if (!saved) throw new Error('缺少保存点位')
    expect(navigationPointIconUrl(point)).toBe(icon.url)
    expect(authoredPointMapDisplay(saved, emptyNavigationDataset)?.location.iconUrl).toBe(icon.url)
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconId: 'official-point-id' }] }, emptyNavigationDataset)).toThrow('未知图标')
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconUrl: 'https://example.com/override.png' }] }, emptyNavigationDataset)).toThrow()
  })

  it('keeps custom URL images independent from the catalogue and official points', () => {
    const point = {
      gravityType: null, id: 'custom-icon', kind: 'navigation' as const,
      stateId: 8, levelId: null, coordinate: { x: 1, y: 2, z: 3 },
      name: '自定义名称', navigationKind: 'service' as const, mode: 'landmark' as const, note: '', iconUrl: 'https://example.com/custom.png',
    }
    expect(navigationIconById('missing')).toBeUndefined()
    expect(() => parsePointLibrary({ version: 1, points: [point] }, emptyNavigationDataset)).toThrow()
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconUrl: 'javascript:alert(1)' }] }, emptyNavigationDataset)).toThrow()
  })
})

it('only moves recent eligible icons to the front and preserves the remaining catalogue order', () => {
  const icons = navigationTypeIcons('service')
  const recent = icons.slice(-3).reverse().map(({ id }) => id)
  const reordered = navigationTypeIcons('service', '', ['unknown-icon', ...recent])
  expect(reordered.map(({ id }) => id)).toEqual([...recent, ...icons.slice(0, -3).map(({ id }) => id)])
  const query = icons[0]?.name.split(' / ')[0] ?? ''
  expect(navigationTypeIcons('service', query, recent)).toEqual(reordered.filter(({ name }) => name.includes(query)))
})


it('uses official map artwork and name for Fenrico instead of the Wiki echo portrait', () => {
  const icons = navigationTypeIcons('normal-boss')
  const icon = icons.find(icon => icon.id === 'map-boss-340000150')
  expect(icon).toMatchObject({ name: '芬莱克', source: 'map', url: 'https://web-static.kurobbs.com/adminConfig/50/props_namephoto/1762500608229.png' })
  expect(navigationIconById('wiki-echo-17409')).toBeUndefined()
  expect(icons.filter(icon => icon.name.includes('芬莱克'))).toHaveLength(1)
})
