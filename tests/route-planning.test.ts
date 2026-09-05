import { readFile } from 'node:fs/promises'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapDatasetSchema } from '../src/domain/schema.ts'
import { useExplorerStore } from '../src/stores/explorer.ts'
import { planRouteInWorker } from '../src/route/worker-client.ts'
import type { MapDataset, RouteResult } from '../src/domain/types.ts'

vi.mock('../src/route/worker-client.ts')
const planner = vi.mocked(planRouteInWorker)
const dataset = mapDatasetSchema.parse(JSON.parse(await readFile(new URL('../public/data/app-data.json', import.meta.url), 'utf8'))) as MapDataset
const result: RouteResult = { points: [], totalCost: 12, algorithm: 'exact', startPointId: null }

function createStore() {
  const store = useExplorerStore()
  store.setDataset(dataset)
  const target = dataset.echoLocations.find(({ stateId, levelId, gameCoordinate }) => stateId === 8 && levelId === null && gameCoordinate !== null)
  if (!target) {
    throw new Error('测试数据缺少可规划声骸')
  }
  store.toggleEcho(target.echoId)
  return store
}

describe('route planning actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    planner.mockReset()
  })

  it('keeps planning when a mobile sheet closes and only sends eligible XYZ points', async () => {
    const pending = Promise.withResolvers<RouteResult>()
    planner.mockReturnValue(pending.promise)
    const store = createStore()
    store.setMobileSheet('route')
    const task = store.planRoute()
    expect(store.planning).toBe(true)
    store.setMobileSheet(null)
    const input = planner.mock.calls[0]?.[0]
    expect(input?.points).toHaveLength(store.routeEligibleLocations.length)
    expect(input?.points.every(({ coordinate }) => Number.isFinite(coordinate.z))).toBe(true)
    expect(planner.mock.calls[0]?.[1]?.aborted).toBe(false)
    pending.resolve(result)
    await task
    expect(store.route).toEqual(result)
    expect(store.planning).toBe(false)
    expect(store.mobileSheet).toBeNull()
  })

  it('aborts an obsolete plan and ignores late completion while a new plan is running', async () => {
    const old = Promise.withResolvers<RouteResult>()
    const next = Promise.withResolvers<RouteResult>()
    planner.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const store = createStore()
    const oldTask = store.planRoute()
    store.setRouteZWeight(2)
    expect(planner.mock.calls[0]?.[1]?.aborted).toBe(true)
    const nextTask = store.planRoute()
    old.resolve(result)
    await oldTask
    expect(store.route).toBeNull()
    expect(store.planning).toBe(true)
    const nextResult = { ...result, totalCost: 24 }
    next.resolve(nextResult)
    await nextTask
    expect(store.route).toEqual(nextResult)
    expect(store.planning).toBe(false)
  })

  it('shows an error and allows retry after a worker failure', async () => {
    planner.mockRejectedValueOnce(new Error('路线计算失败')).mockResolvedValueOnce(result)
    const store = createStore()
    await store.planRoute()
    expect(store.routeError).toBe('路线计算失败')
    expect(store.planning).toBe(false)
    await store.planRoute()
    expect(store.routeError).toBe('')
    expect(store.route).toEqual(result)
  })

  it('restores mutually exclusive sheet state and keeps the desktop preference independent', () => {
    const store = createStore()
    store.restoreUrlState({ mobileSheet: 'filters', controlPanelCollapsed: true })
    expect(store.mobileSheet).toBe('filters')
    store.setMobileSheet('route')
    expect(store.mobileSheet).toBe('route')
    expect(store.controlPanelCollapsed).toBe(true)
    store.restoreUrlState({})
    expect(store.mobileSheet).toBeNull()
    expect(store.controlPanelCollapsed).toBe(false)
  })
})
