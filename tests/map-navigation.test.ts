import { readMapDataset } from '../scripts/lib/map-data.ts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeMapNavigation, flattenRegions } from '../scripts/lib/map/normalize.ts'
import { mapDatasetSchema } from '../src/domain/schema.ts'
import { useExplorerStore } from '../src/stores/explorer.ts'
import { mapNavigationOptions, mapNavigationSectionAtCenter } from '../src/components/map-navigation-options.ts'
import { cascaderColumns, resolveCascaderChoice } from '../src/components/base/cascader.ts'

const dataset = await readMapDataset()
const destination = (name: string) => {
  const region = dataset.regionLabels.find((region) => region.name === name && region.level === 2)
  if (!region) throw new Error(`缺少地区 ${name}`)
  return region
}

beforeEach(() => setActivePinia(createPinia()))

describe('map navigation destinations', () => {
  it('resolves the second Popover level represented by the canvas center', () => {
    for (const [name, sectionName] of [
      ['蚀刻平原', '拉海洛'],
      ['冰原运输港', '冰原地表'],
      ['今州城', '今州'],
      ['玄方城', '梦州'],
      ['梦枢天罗', '梦州'],
      ['黑海岸群岛', '黑海岸群岛'],
    ] as const) {
      const region = destination(name)
      const section = mapNavigationSectionAtCenter(dataset, region.stateId, [region.coordinate.mapX, region.coordinate.mapY])
      expect(section?.name).toBe(sectionName)
      const columns = cascaderColumns(mapNavigationOptions(dataset), section?.expandedValues ?? [])
      expect(columns).toHaveLength(name === '黑海岸群岛' ? 2 : 3)
      expect(columns.at(-1)?.options).toContainEqual({ value: region.id, label: region.name })
      if (name !== '黑海岸群岛') expect(columns.at(-1)?.parent?.label).toBe(sectionName)
    }
    expect(mapNavigationSectionAtCenter(dataset, -1, [0, 0])).toBeNull()
  })

  it('preserves official group order and distinct group/map IDs with a shared label destination', () => {
    const countries = [{
      countryId: 4, stateId: 8, name: '罗伊冰原', mapStateId: '5,6,7', mapStateName: '拉海洛,冰原地表,黯原',
      countrys: [
        { name: '冰原运输港', countryId: 4, stateId: 8, mapState: '6', xPosition: 100, yPosition: 200 },
        { name: '蚀刻平原', countryId: 4, stateId: 906, mapState: '5', xPosition: 300, yPosition: 400 },
        { name: '恒黯之原', countryId: 4, stateId: 909, mapState: '7', xPosition: 500, yPosition: 600 },
      ],
    }]
    const labels = flattenRegions(countries)
    const [country] = normalizeMapNavigation(countries)
    expect(country?.groups.map(({ id, name }) => [id, name])).toEqual([['5', '拉海洛'], ['6', '冰原地表'], ['7', '黯原']])
    expect(labels.find((label) => label.id === country?.groups[0]?.regionIds[0])).toMatchObject({ name: '蚀刻平原', stateId: 906 })
    expect(normalizeMapNavigation([{ ...countries[0], mapStateId: '', mapStateName: '' }])[0]).toMatchObject({ groups: [], regionIds: country?.regionIds })
  })

  it('browses and cancels without changing the current map, viewport, or filters', () => {
    const store = useExplorerStore()
    store.setDataset(structuredClone(dataset))
    store.setMapViewport({ center: [1200, 1600], zoom: 2 })
    store.toggleEcho(dataset.echoes[0]?.id ?? '')
    const options = mapNavigationOptions(dataset)
    const country = resolveCascaderChoice(options, [], 0, 'country:4')
    const group = resolveCascaderChoice(options, country?.path ?? [], 1, 'group:4:5')
    expect(group?.kind).toBe('expand')
    expect(cascaderColumns(options, group?.path ?? []).at(-1)?.options.map(({ label }) => label)).toContain('蚀刻平原')
    expect(store.selectedStateId).toBe(8)
    expect(store.selectedCountryId).toBeNull()
    expect(store.mapViewport).toEqual({ center: [1200, 1600], zoom: 2 })
    expect(store.mapNavigationRequest).toBeNull()
    expect(cascaderColumns(options, [])).toHaveLength(1)
    expect(store.mapViewport).toEqual({ center: [1200, 1600], zoom: 2 })
    expect(store.selectedEchoIds).toHaveLength(1)
  })

  it.each([
    ['蚀刻平原', 906], ['冰原运输港', 8], ['恒黯之原', 909],
    ['玄方城', 8], ['梦枢天罗', 912], ['今州城', 8], ['下层金库', 902], ['阿维纽林', 903],
  ])('navigates to %s using its resource map %s and preserves echo selection', (name, stateId) => {
    const store = useExplorerStore()
    store.setDataset(structuredClone(dataset))
    store.selectCountry(4)
    store.selectLevel(dataset.states[0]?.layeredMaps[0]?.floors[0]?.id ?? 'old-floor')
    store.setMobileSheet('filters')
    store.toggleEcho(dataset.echoes[0]?.id ?? '')
    const region = destination(String(name))
    store.navigateToRegion(region.id)
    expect(store.selectedStateId).toBe(stateId)
    expect(store.selectedCountryId).toBeNull()
    expect(store.selectedLevelId).toBeNull()
    expect(store.mapNavigationRequest).toEqual({ regionId: region.id })
    expect(store.mobileSheet).toBeNull()
    expect(store.selectedEchoIds).toHaveLength(1)
  })

  it('includes Mengshu Tianluo under Mengzhou with independent tiles, floors and points', () => {
    const region = destination('梦枢天罗')
    const options = mapNavigationOptions(dataset)
    const columns = cascaderColumns(options, ['country:1', 'group:1:8'])
    expect(columns.at(-1)?.options).toContainEqual({ value: region.id, label: '梦枢天罗' })
    const state = dataset.states.find(({ id }) => id === region.stateId)
    expect(state?.id).toBe(912)
    expect(state?.tileIds.length).toBeGreaterThan(0)
    expect(state?.tileIds.every((id) => id.startsWith('912_'))).toBe(true)
    const floors = new Set(state?.layeredMaps.flatMap(({ floors }) => floors.map(({ id }) => id)))
    expect(floors.size).toBeGreaterThan(0)
    const echoes = dataset.echoLocations.filter(({ stateId }) => stateId === 912)
    expect(echoes.length).toBeGreaterThan(0)
    expect(echoes.some(({ levelId }) => levelId !== null && floors.has(levelId))).toBe(true)
    const points = dataset.navigationPoints.filter(({ stateId }) => stateId === 912)
    expect(new Set(points.map(({ kind }) => kind))).toEqual(new Set(['beacon', 'nexus', 'boss', 'challenge', 'tacet-field', 'entrance']))
    expect(points.filter(({ kind }) => kind === 'boss' || kind === 'challenge').every(({ mode }) => mode === 'fast-travel')).toBe(true)
  })

  it('allows repeat actions on the same shared map after panning, without retaining a selected destination', () => {
    const store = useExplorerStore()
    store.setDataset(structuredClone(dataset))
    const region = destination('玄方城')
    store.navigateToRegion(region.id)
    store.completeMapNavigation()
    store.setMapViewport({ center: [5000, 6000], zoom: 3 })
    store.navigateToRegion(region.id)
    expect(store.selectedStateId).toBe(8)
    expect(store.mapNavigationRequest).toEqual({ regionId: region.id })
    expect(store.mapViewport).toBeNull()
  })

  it('skips the group level for Black Shores and ignores invalid destination actions', () => {
    const store = useExplorerStore()
    store.setDataset(structuredClone(dataset))
    const options = mapNavigationOptions(dataset)
    const columns = cascaderColumns(options, ['country:900'])
    expect(columns).toHaveLength(2)
    expect(columns[1]?.options.map(({ label }) => label)).toEqual(['黑海岸群岛', '泰缇斯之底', '时隙废都'])
    expect(columns[1]?.options.every((option) => !option.children)).toBe(true)
    store.navigateToRegion('not-a-region')
    expect(store.selectedStateId).toBe(8)
    expect(store.mapNavigationRequest).toBeNull()
  })

  it('rejects missing, cross-country and duplicate navigation references', () => {
    const country = dataset.mapNavigation[0]
    if (!country) throw new Error('缺少地图导航测试数据')
    const invalid = structuredClone(dataset)
    invalid.mapNavigation = [{ ...structuredClone(country), regionIds: ['missing-region'] }]
    expect(mapDatasetSchema.safeParse(invalid).success).toBe(false)
    invalid.mapNavigation = [{ ...structuredClone(country), id: -1 }]
    expect(mapDatasetSchema.safeParse(invalid).success).toBe(false)
    invalid.mapNavigation = [country, country]
    expect(mapDatasetSchema.safeParse(invalid).success).toBe(false)
  })
})
