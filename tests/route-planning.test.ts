import { convertOfficialPoints } from '../scripts/lib/official-point-library.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useExplorerStore } from '../src/stores/explorer.ts'
import { planRouteInWorker } from '../src/route/worker-client.ts'
import { movementCost, optimizeRoute } from '../src/route/optimizer.ts'
import type { AuthoredEchoPoint, AuthoredNavigationPoint, RouteResult } from '../src/domain/types.ts'
import { echoMembers } from '../src/domain/point-library.ts'
import { mapToGameCoordinate } from '../src/map/projection.ts'

vi.mock('../src/route/worker-client.ts')
const planner = vi.mocked(planRouteInWorker)
const dataset = await readMapDataset()
const result: RouteResult = { points: [], totalCost: 12, algorithm: 'exact', startPointId: null }

function createStore() {
  const store = useExplorerStore()
  store.setDataset(dataset)
    store.setOfficialPointLibrary(convertOfficialPoints(dataset))
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
    store.setMobileSheet('filters')
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

  it('clears the previous route as soon as replacement planning starts', async () => {
    const pending = Promise.withResolvers<RouteResult>()
    planner.mockReturnValue(pending.promise)
    const store = createStore()
    store.setRoute(result)

    const task = store.planRoute()

    expect(store.route).toBeNull()
    expect(store.routePlan).toBeNull()
    expect(store.planning).toBe(true)
    pending.resolve({ ...result, totalCost: 24 })
    await task
    expect(store.route?.totalCost).toBe(24)
  })

  it('aborts an obsolete plan and ignores late completion while a new plan is running', async () => {
    const old = Promise.withResolvers<RouteResult>()
    const next = Promise.withResolvers<RouteResult>()
    planner.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const store = createStore()
    const oldTask = store.planRoute()
    store.clearRoute()
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

  it.each(['planRoute', 'planAllRoutes'] as const)('%s normalizes legacy starts while preserving Mengzhou and source coordinates', async (action) => {
    const echoId = dataset.echoes[0]?.id
    if (!echoId) throw new Error('测试数据缺少声骸')
    const contexts = ['今州城', '玄方城', '梦枢天罗'].map((name, index) => {
      const label = dataset.regionLabels.find((region) => region.name === name)
      if (!label) throw new Error(`缺少测试地区：${name}`)
      const [x, y] = mapToGameCoordinate(label.coordinate.mapX, label.coordinate.mapY, dataset.source.tileWidth)
      const echo: AuthoredEchoPoint = {
        id: `echo-${index}`, kind: 'echo', stateId: label.stateId, levelId: null, gravityType: 1,
        coordinate: { x: Math.round(x), y: Math.round(y), z: index === 0 ? 0 : 40 },
        members: [{ echoId, count: 1 }],
        ...(index === 0 ? { officialIds: ['official-test'] } : {}),
      }
      const navigation: AuthoredNavigationPoint = {
        id: `navigation-${index}`, kind: 'navigation', stateId: label.stateId, levelId: null, gravityType: 1,
        name, navigationKind: 'beacon', mode: 'fast-travel',
        coordinate: { ...echo.coordinate, x: Math.round(x) - 10, z: 300 },
        teleportCoordinate: { ...echo.coordinate, x: Math.round(x) - 5, z: 400 },
      }
      return { echo, navigation, expectedZ: index === 0 ? 0 : 400 }
    })
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.setPointLibrary({ version: 1, points: contexts.flatMap(({ echo, navigation }) => (
      echo.officialIds ? [navigation] : [navigation, echo]
    )) })
    store.setOfficialPointLibrary({ version: 1, points: contexts.flatMap(({ echo }) => echo.officialIds ? [echo] : []) })
    store.toggleEcho(echoId)
    planner.mockImplementation(async (input) => optimizeRoute(input))

    await store[action]()

    expect(store.routeError).toBe('')
    expect(planner).toHaveBeenCalledTimes(action === 'planRoute' ? 1 : 2)
    const starts = planner.mock.calls.flatMap(([input]) => input.startPoints)
    const expected = contexts.filter(({ navigation }) => action === 'planAllRoutes' || navigation.stateId === 8)
    expect(starts).toHaveLength(expected.length)
    for (const { navigation, expectedZ } of expected) {
      expect(starts.find(({ id }) => id === navigation.id)).toMatchObject({
        coordinate: { ...navigation.teleportCoordinate, z: expectedZ }, isTeleportArrival: true,
      })
      expect(store.allNavigationPoints.find(({ id }) => id === navigation.id)).toMatchObject({
        gameCoordinate: navigation.coordinate, teleportCoordinate: navigation.teleportCoordinate,
      })
    }
    const routes = store.routePlan?.groups.map(({ route }) => route) ?? [store.route]
    expect(routes.flatMap((route) => route?.points ?? []).find(({ id }) => id === 'echo-0')?.teleportFrom).toMatchObject({
      id: 'navigation-0', coordinate: { z: 0 },
    })
  })

  it('plans every populated map context independently and keeps the plan while switching maps', async () => {
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.setOfficialPointLibrary(convertOfficialPoints(dataset))
    const statesByEcho = new Map<string, Set<number>>()
    for (const location of store.allEchoLocations) {
      for (const { echoId } of echoMembers(location)) {
        const states = statesByEcho.get(echoId) ?? new Set<number>()
        states.add(location.stateId)
        statesByEcho.set(echoId, states)
      }
    }
    const echoId = [...statesByEcho].find(([, states]) => states.size > 1)?.[0]
    if (!echoId) throw new Error('测试数据缺少跨地图声骸')
    store.toggleEcho(echoId)
    const floorLocation = store.allEchoLocations.find(({ stateId, levelId, gravityType, gameCoordinate }) => (
      stateId === store.selectedStateId && levelId !== null && gravityType === store.selectedGravity && gameCoordinate !== null
    ))
    const floorEchoId = floorLocation ? echoMembers(floorLocation)[0]?.echoId : undefined
    if (!floorEchoId) throw new Error('测试数据缺少当前地图的楼层声骸')
    if (!store.selectedEchoIds.includes(floorEchoId)) store.toggleEcho(floorEchoId)
    const candidates = store.routeGroupCandidates.filter(({ locations }) => locations.length > 0)
    expect(new Set(candidates.map(({ stateId }) => stateId)).size).toBeGreaterThan(1)
    planner.mockImplementation(async (input) => ({
      points: input.points, totalCost: input.points.length, algorithm: 'exact', startPointId: null,
    }))

    await store.planAllRoutes()

    expect(planner).toHaveBeenCalledTimes(candidates.length)
    expect(new Set(store.routePlan?.groups.map(({ id }) => id))).toEqual(new Set(candidates.map(({ id }) => id)))
    expect(store.routePlan?.totalPoints).toBe(candidates.reduce((sum, group) => sum + group.locations.length, 0))
    const plan = store.routePlan
    if (!plan) throw new Error('测试路线计划未生成')
    store.selectLevel(null)
    const mainMapRoutes = plan.groups.filter(({ stateId, gravityType }) => (
      stateId === store.selectedStateId && gravityType === store.selectedGravity
    ))
    expect(mainMapRoutes.some(({ levelId }) => levelId === null)).toBe(true)
    expect(mainMapRoutes.some(({ levelId }) => levelId !== null)).toBe(true)
    expect(store.mapRoutes).toEqual(mainMapRoutes.map(({ route }) => route))
    const destination = plan?.groups.find(({ stateId }) => stateId !== store.selectedStateId) ?? plan?.groups[1]
    if (!destination) throw new Error('测试路线缺少可切换地图')
    store.activateRouteGroup(destination.id)
    expect(store.routePlan).toBe(plan)
    expect(store.selectedStateId).toBe(destination.stateId)
    expect(store.selectedLevelId).toBe(destination.levelId)
    expect(store.selectedGravity).toBe(destination.gravityType)
    expect(store.route).toBe(destination.route)
    expect(store.mapRoutes).toEqual([destination.route])

    const replacement = Promise.withResolvers<RouteResult>()
    planner.mockReset()
    planner.mockImplementationOnce(() => replacement.promise).mockImplementation(async (input) => ({
      points: input.points, totalCost: input.points.length, algorithm: 'exact', startPointId: null,
    }))
    const replacementTask = store.planAllRoutes()
    expect(store.routePlan).toBeNull()
    expect(store.route).toBeNull()
    expect(store.planning).toBe(true)
    replacement.resolve(result)
    await replacementTask
    expect(store.routePlan).not.toBeNull()
  })

  it('plans neighboring official echoes as a continuous walk without official teleport starts', async () => {
    planner.mockImplementation(async (input) => optimizeRoute(input))
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.setOfficialPointLibrary(convertOfficialPoints(dataset))
    store.setSonataFilters(['wiki-sonata-19922'])
    store.selectCandidateEchoes()
    await store.planRoute()

    expect(store.routeError).toBe('')
    const route = store.route
    if (!route) throw new Error('长路启航之星路线未生成')
    const first = route.points.findIndex(({ coordinate: { x, y } }) => x === -462 && y === -7939)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(route.points.slice(first, first + 2).map(({ coordinate }) => coordinate)).toEqual([
      { x: -462, y: -7939, z: 0 },
      { x: -506, y: -8016, z: 0 },
    ])
    expect(route.points.every(({ teleportFrom }) => !teleportFrom)).toBe(true)
    expect(route.points[first + 1]?.teleportFrom).toBeUndefined()
    const input = planner.mock.calls[0]?.[0]
    if (!input) throw new Error('路线计算输入缺失')
    expect(input.startPoints).toEqual([])
    expect(route.points).toHaveLength(input.points.length)
    expect(new Set(route.points.map(({ id }) => id))).toEqual(new Set(input.points.map(({ id }) => id)))
    const totalCost = route.points.reduce((cost, point, index) => {
      const previous = point.teleportFrom ?? route.points[index - 1]
      return cost + (previous ? movementCost(previous, point, input) : 0)
    }, 0)
    expect(route.totalCost).toBeCloseTo(totalCost, 8)
  }, 15_000)

  it('restores the combined mobile sheet and keeps the desktop preference independent', () => {
    const store = createStore()
    store.restoreUrlState({ mobileSheet: 'filters', controlPanelCollapsed: true })
    expect(store.mobileSheet).toBe('filters')
    store.setMobileSheet(null)
    expect(store.mobileSheet).toBeNull()
    expect(store.controlPanelCollapsed).toBe(true)
    store.restoreUrlState({})
    expect(store.mobileSheet).toBeNull()
    expect(store.controlPanelCollapsed).toBe(false)
  })
})
