import { convertOfficialPoints } from '../scripts/lib/official-point-library.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useExplorerStore } from '../src/stores/explorer.ts'
import { echoMembers } from '../src/domain/point-library.ts'


describe('explorer point group visibility', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows no echo locations until a final echo target is selected', async () => {
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
    store.setPointSourceFilters(['official'])

    expect(store.visibleEchoLocations).toEqual([])

    store.toggleEcho(location.echoId)
    expect(store.visibleEchoLocations.length).toBeGreaterThan(0)
    expect(store.visibleEchoLocations.every((point) => echoMembers(point).some(({ echoId }) => echoId === location.echoId))).toBe(true)

    store.clearSelectedEchoes()
    expect(store.visibleEchoLocations).toEqual([])

    const sonataId = echo.sonataIds[0]
    const sonataEchoIds = new Set(dataset.echoes
      .filter(({ sonataIds }) => sonataIds.includes(sonataId))
      .map(({ id }) => id))
    store.setSonataFilters([sonataId])
    expect(store.visibleEchoLocations).toEqual([])
    store.selectCandidateEchoes()
    expect(store.visibleEchoLocations.length).toBeGreaterThan(0)
    expect(store.visibleEchoLocations.every((point) => echoMembers(point).some(({ echoId }) => sonataEchoIds.has(echoId)))).toBe(true)
  })

  it('keeps explicit echo selection independent of sonata and search results', async () => {
    const dataset = await readMapDataset()
    const location = dataset.echoLocations.find(({ stateId, levelId }) => stateId === 8 && levelId === null)
    if (!location) throw new Error('测试数据缺少声骸点')
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.setOfficialPointLibrary(convertOfficialPoints(dataset))
    store.setPointSourceFilters(['official'])
    store.toggleEcho(location.echoId)
    const locations = store.visibleEchoLocations
    store.setSonataFilters(['unmatched-sonata'])
    store.setEchoSearch('不存在的声骸名称')
    expect(store.filteredEchoes).toEqual([])
    expect(store.visibleEchoLocations).toEqual(locations)
  })

  it('validates restored scope and IDs while preserving valid selections', async () => {
    const dataset = await readMapDataset()
    const echo = dataset.echoes[0]
    if (!echo) throw new Error('测试数据缺少声骸')
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.setOfficialPointLibrary(convertOfficialPoints(dataset))
    store.setPointSourceFilters(['official'])
    store.restoreUrlState({ pointSourceFilters: ['official'],
      stateId: -999,
      countryId: -999,
      levelId: 'unknown-floor',
      echoIds: ['unknown-echo', echo.id],
      sonataFilterIds: ['unknown-sonata', echo.sonataIds[0]],
      echoCostFilters: [echo.cost],
    })
    expect(store.selectedStateId).toBe(8)
    expect(store.selectedCountryId).toBeNull()
    expect(store.selectedLevelId).toBeNull()
    expect(store.selectedEchoIds).toEqual([echo.id])
    expect(store.sonataFilterIds).toEqual([echo.sonataIds[0]])
    expect(store.echoCostFilters).toEqual([echo.cost])
  })

  it('combines candidate filters and keeps list search outside batch selection', async () => {
    const dataset = await readMapDataset()
    const shared = dataset.echoes.find(({ sonataIds }) => sonataIds.length > 1)
    if (!shared) throw new Error('测试数据缺少多套装声骸')
    const [firstSonata, secondSonata] = shared.sonataIds
    if (!firstSonata || !secondSonata) throw new Error('测试数据缺少套装')
    const store = useExplorerStore()
    store.setDataset(dataset)

    store.setSonataFilters([firstSonata, secondSonata])
    store.setEchoCostFilters([shared.cost])
    const expected = dataset.echoes.filter((echo) => (
      echo.cost === shared.cost && echo.sonataIds.some((id) => id === firstSonata || id === secondSonata)
    ))
    expect(store.filteredEchoes.map(({ id }) => id)).toEqual(expected.map(({ id }) => id))
    expect(store.candidateEchoes.map(({ id }) => id)).toEqual(expected.map(({ id }) => id))

    store.setEchoCostFilters([1, 3])
    const expectedBothCosts = dataset.echoes.filter((echo) => (
      echo.sonataIds.some((id) => id === firstSonata || id === secondSonata)
    ))
    expect(store.filteredEchoes.map(({ id }) => id)).toEqual(expectedBothCosts.map(({ id }) => id))
    store.setEchoCostFilters([])
    expect(store.filteredEchoes.map(({ id }) => id)).toEqual(expectedBothCosts.map(({ id }) => id))
    store.setEchoCostFilters([shared.cost])

    store.selectCandidateEchoes()
    expect(store.selectedEchoIds).toEqual(expected.map(({ id }) => id))
    store.setEchoSearch(shared.name)
    expect(store.filteredEchoes.map(({ id }) => id)).toEqual([shared.id])
    expect(store.candidateEchoes.map(({ id }) => id)).toEqual(expected.map(({ id }) => id))
    store.deselectCandidateEchoes()
    expect(store.selectedEchoIds).toEqual([])

    store.resetEchoFilters()
    expect(store.sonataFilterIds).toEqual([])
    expect(store.echoCostFilters).toEqual([])
    expect(store.echoSearch).toBe('')
    expect(store.selectedEchoIds).toEqual([])
  })

  it('keeps the route while candidate filters change and clears it when final targets change', async () => {
    const dataset = await readMapDataset()
    const echo = dataset.echoes[0]
    if (!echo) throw new Error('测试数据缺少声骸')
    const store = useExplorerStore()
    store.setDataset(dataset)
    const route = { points: [], algorithm: 'exact' as const, totalCost: 0, startPointId: null }
    store.setRoute(route)

    store.setSonataFilters([echo.sonataIds[0]])
    store.setEchoCostFilters([echo.cost])
    store.setEchoSearch(echo.name)
    store.resetEchoFilters()
    expect(store.route).toEqual(route)

    store.toggleEcho(echo.id)
    expect(store.route).toBeNull()
  })

})
