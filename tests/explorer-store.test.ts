import { readFile } from 'node:fs/promises'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { mapDatasetSchema } from '../src/domain/schema.ts'
import { useExplorerStore } from '../src/stores/explorer.ts'
import type { MapDataset } from '../src/domain/types.ts'

const datasetUrl = new URL('../public/data/app-data.json', import.meta.url)

describe('explorer point group visibility', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows no echo locations until an echo or sonata is selected', async () => {
    const dataset = mapDatasetSchema.parse(JSON.parse(await readFile(datasetUrl, 'utf8'))) as MapDataset
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

    expect(store.visibleEchoLocations).toEqual([])

    store.toggleEcho(location.echoId)
    expect(store.visibleEchoLocations.length).toBeGreaterThan(0)
    expect(store.visibleEchoLocations.every(({ echoId }) => echoId === location.echoId)).toBe(true)

    store.clearFilters()
    expect(store.visibleEchoLocations).toEqual([])

    const sonataId = echo.sonataIds[0]
    const sonataEchoIds = new Set(dataset.echoes
      .filter(({ sonataIds }) => sonataIds.includes(sonataId))
      .map(({ id }) => id))
    store.toggleSonata(sonataId)
    expect(store.visibleEchoLocations.length).toBeGreaterThan(0)
    expect(store.visibleEchoLocations.every(({ echoId }) => sonataEchoIds.has(echoId))).toBe(true)
  })

  it('hides every point in an icon group without changing route eligibility', async () => {
    const dataset = mapDatasetSchema.parse(JSON.parse(await readFile(datasetUrl, 'utf8'))) as MapDataset
    const store = useExplorerStore()
    store.setDataset(dataset)
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
    const dataset = mapDatasetSchema.parse(JSON.parse(await readFile(datasetUrl, 'utf8'))) as MapDataset
    const point = dataset.navigationPoints.find(({ stateId }) => stateId === 8)
    if (!point) {
      throw new Error('测试数据缺少默认地图定位点')
    }
    const store = useExplorerStore()
    store.setDataset(dataset)

    store.restoreUrlState({ hiddenPointGroupIds: [point.typeId] })

    expect(store.hiddenPointGroupIds).toEqual([point.groupId])
  })
})
