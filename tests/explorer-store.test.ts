import { convertOfficialPoints } from '../scripts/lib/official-point-library.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useExplorerStore } from '../src/stores/explorer.ts'
import { echoMembers } from '../src/domain/point-library.ts'


describe('explorer point group visibility', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows no echo locations until an echo or sonata is selected', async () => {
    const dataset = await readMapDataset()
    const location = dataset.echoLocations.find(({ stateId, levelId }) => stateId === 8 && levelId === null)
    if (!location) {
      throw new Error('测试数据缺少默认地图声骸点')
    }
    const echo = dataset.echoes.find(({ id }) => id === location.echoId)
    if (!echo) {
      throw new Error('测试数据缺少默认地图声骸定义')
    }
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.setOfficialPointLibrary(convertOfficialPoints(dataset))
    store.setPointSource('official')

    expect(store.visibleEchoLocations).toEqual([])

    store.toggleEcho(location.echoId)
    expect(store.visibleEchoLocations.length).toBeGreaterThan(0)
    expect(store.visibleEchoLocations.every((point) => echoMembers(point).some(({ echoId }) => echoId === location.echoId))).toBe(true)

    store.clearFilters()
    expect(store.visibleEchoLocations).toEqual([])

    const sonataId = echo.sonataIds[0]
    const sonataEchoIds = new Set(dataset.echoes
      .filter(({ sonataIds }) => sonataIds.includes(sonataId))
      .map(({ id }) => id))
    store.toggleSonata(sonataId)
    expect(store.visibleEchoLocations.length).toBeGreaterThan(0)
    expect(store.visibleEchoLocations.every((point) => echoMembers(point).some(({ echoId }) => sonataEchoIds.has(echoId)))).toBe(true)
  })

  it('hides every point in an icon group without changing route eligibility', async () => {
    const dataset = await readMapDataset()
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.setOfficialPointLibrary(convertOfficialPoints(dataset))
    store.setPointSource('official')
    const multiTypeGroup = dataset.navigationPointGroups.find(({ typeIds }) => typeIds.length > 1)
    if (!multiTypeGroup) {
      throw new Error('测试数据缺少多类型图标分组')
    }
    const eligibleCount = store.routeEligibleNavigationPoints.length
    const visibleSnapshot = store.hiddenPointGroupIds

    store.setPointGroupVisible(multiTypeGroup.id, true)
    expect(store.hiddenPointGroupIds).toBe(visibleSnapshot)

    store.setPointGroupVisible(multiTypeGroup.id, false)

    expect(store.hiddenPointGroupIds).not.toBe(visibleSnapshot)
    expect(visibleSnapshot).toEqual([])
    expect(store.hiddenPointGroupIds).toContain(multiTypeGroup.id)
    expect(store.visibleNavigationPoints.some(({ groupId }) => groupId === multiTypeGroup.id)).toBe(false)
    expect(store.routeEligibleNavigationPoints).toHaveLength(eligibleCount)

    store.showAllPointGroups()
    expect(store.hiddenPointGroupIds).toEqual([])
    expect(store.visibleNavigationPoints.some(({ groupId }) => groupId === multiTypeGroup.id)).toBe(true)
  })

  it('restores a legacy hidden type id as its icon group', async () => {
    const dataset = await readMapDataset()
    const point = dataset.navigationPoints.find(({ stateId }) => stateId === 8)
    if (!point) {
      throw new Error('测试数据缺少默认地图定位点')
    }
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.setOfficialPointLibrary(convertOfficialPoints(dataset))
    store.setPointSource('official')

    store.restoreUrlState({ pointSource: 'official', hiddenPointGroupIds: [point.typeId] })

    expect(store.hiddenPointGroupIds).toEqual([point.groupId])
  })

  it('keeps explicit echo selection independent of sonata and search results', async () => {
    const dataset = await readMapDataset()
    const location = dataset.echoLocations.find(({ stateId, levelId }) => stateId === 8 && levelId === null)
    if (!location) throw new Error('测试数据缺少声骸点')
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.setOfficialPointLibrary(convertOfficialPoints(dataset))
    store.setPointSource('official')
    store.toggleEcho(location.echoId)
    const locations = store.visibleEchoLocations
    store.toggleSonata('unmatched-sonata')
    store.setEchoSearch('不存在的声骸名称')
    expect(store.echoesMatchingSonata).toEqual([])
    expect(store.visibleEchoLocations).toEqual(locations)
  })

  it('validates restored scope and IDs while preserving valid selections', async () => {
    const dataset = await readMapDataset()
    const echo = dataset.echoes[0]
    const point = dataset.navigationPoints[0]
    if (!echo || !point) throw new Error('测试数据缺少声骸或定位点')
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.setOfficialPointLibrary(convertOfficialPoints(dataset))
    store.setPointSource('official')
    store.restoreUrlState({ pointSource: 'official',
      stateId: -999,
      countryId: -999,
      levelId: 'unknown-floor',
      echoIds: ['unknown-echo', echo.id],
      sonataIds: ['unknown-sonata', echo.sonataIds[0]],
      hiddenPointGroupIds: ['unknown-group', point.typeId, point.groupId],
      routeZWeight: Number.NaN,
    })
    expect(store.selectedStateId).toBe(8)
    expect(store.selectedCountryId).toBeNull()
    expect(store.selectedLevelId).toBeNull()
    expect(store.selectedEchoIds).toEqual([echo.id])
    expect(store.selectedSonataIds).toEqual([echo.sonataIds[0]])
    expect(store.hiddenPointGroupIds).toEqual([point.groupId])
    expect(store.routeZWeight).toBe(1.35)
  })
})
