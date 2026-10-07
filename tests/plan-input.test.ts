import { describe, expect, it } from 'vitest'
import { createRoutePlanInput } from '../src/route/plan-input.ts'
import { movementCost, optimizeRoute } from '../src/route/optimizer.ts'
import { gameToMapCoordinate, mapToGameCoordinate } from '../src/map/projection.ts'
import type { EchoLocation, NavigationPoint } from '../src/domain/types.ts'
import { referenceDataset } from './fixtures/point-library.ts'

const location: EchoLocation = {
  gravityType: null,
  id: 'echo-point', echoId: 'echo', typeId: 'type', typeName: '声骸', iconUrl: '',
  stateId: 8, countryId: 1, layeredMapId: null, levelId: 'floor',
  coordinate: { rawX: 100, rawY: 200, mapX: 300, mapY: 400 },
  gameCoordinate: { x: 1, y: 2, z: 30 }, quality: 'manual',
}
const startPoint: NavigationPoint = {
  ...location, groupId: 'beacon', catalogCategoryId: 'navigation', catalogCategoryName: '传送',
  mode: 'fast-travel', kind: 'beacon',
}

function navigationAt(name: string): NavigationPoint {
  const region = referenceDataset.regionLabels.find((label) => label.name === name)
  if (!region) throw new Error(`缺少测试地区：${name}`)
  return {
    ...startPoint, stateId: region.stateId, countryId: region.countryId, coordinate: region.coordinate,
    gameCoordinate: Object.freeze({ x: 1, y: 2, z: 300 }),
  }
}

describe('route input conversion', () => {
  it('preserves independent map XY and authoritative XYZ with floor identity', () => {
    expect(createRoutePlanInput(null, [location], [], 8)).toEqual({
      points: [{
        id: 'echo-point', name: '声骸', echoId: 'echo', stateId: 8, levelId: 'floor',
        coordinate: { x: 1, y: 2, z: 30 }, mapCoordinate: [300, 400],
      }],
      startPoints: [], connectors: [],
    })
  })

  it('rejects provisional points instead of deriving Z from map coordinates', () => {
    expect(() => createRoutePlanInput(null, [{ ...location, gameCoordinate: null }], [], 8))
      .toThrow('点位 echo-point 缺少 XYZ')
  })

  it('uses an explicit teleport arrival for route distance and map drawing, with marker fallback', () => {
    const teleportCoordinate = { x: 10, y: 20, z: 40 }
    const explicit = createRoutePlanInput(null, [], [{ ...startPoint, teleportCoordinate }], 8).startPoints[0]
    expect(explicit).toMatchObject({
      id: startPoint.id,
      coordinate: teleportCoordinate,
      mapCoordinate: gameToMapCoordinate(teleportCoordinate.x, teleportCoordinate.y),
      isTeleportArrival: true,
    })

    const fallback = createRoutePlanInput(null, [], [startPoint], 8).startPoints[0]
    expect(fallback).toMatchObject({ coordinate: startPoint.gameCoordinate, mapCoordinate: [300, 400] })
    expect(fallback).not.toHaveProperty('isTeleportArrival')
  })

  it.each([
    '今州城', '拉古那城', '七丘', '冰原运输港', '黑海岸群岛',
    '泰缇斯之底', '时隙废都', '阿维纽林', '下层金库', '隐海试验场', '蚀刻平原', '恒黯之原',
  ])('uses zero navigation height in %s without changing authored coordinates or floors', (name) => {
    const source = navigationAt(name)
    const input = createRoutePlanInput(referenceDataset, [], [source], source.stateId)
    expect(input.startPoints[0]).toMatchObject({
      coordinate: { x: 1, y: 2, z: 0 },
      mapCoordinate: [source.coordinate.mapX, source.coordinate.mapY],
      stateId: source.stateId, levelId: source.levelId,
    })
    expect(source.gameCoordinate).toEqual({ x: 1, y: 2, z: 300 })
  })

  it.each(['玄方城', '梦枢天罗'])('preserves measured navigation height in %s', (name) => {
    const source = navigationAt(name)
    const input = createRoutePlanInput(referenceDataset, [], [source], source.stateId)
    expect(input.startPoints[0]?.coordinate).toEqual({ x: 1, y: 2, z: 300 })
  })

  it('normalizes each region independently on the shared map and keeps echo heights', () => {
    const jinzhou = navigationAt('今州城')
    const mengzhou = navigationAt('玄方城')
    const echo = { ...location, coordinate: jinzhou.coordinate }
    const input = createRoutePlanInput(referenceDataset, [echo], [jinzhou, mengzhou], 8)
    expect(input.startPoints.map(({ coordinate }) => coordinate.z)).toEqual([0, 300])
    expect(input.points[0]?.coordinate).toEqual({ x: 1, y: 2, z: 30 })
  })

  it.each([
    ['今州城', '玄方城', 0],
    ['玄方城', '今州城', 400],
  ] as const)('classifies a teleport by its %s marker even when its arrival is in %s', (name, arrivalName, expectedZ) => {
    const marker = navigationAt(name)
    const arrival = navigationAt(arrivalName)
    const [x, y] = mapToGameCoordinate(arrival.coordinate.mapX, arrival.coordinate.mapY)
    const teleportCoordinate = Object.freeze({ x, y, z: 400 })
    const source = { ...marker, teleportCoordinate }
    const input = createRoutePlanInput(referenceDataset, [], [source], source.stateId)
    expect(input.startPoints[0]).toMatchObject({
      coordinate: { x, y, z: expectedZ },
      mapCoordinate: gameToMapCoordinate(x, y),
      isTeleportArrival: true,
    })
    expect(source.teleportCoordinate).toEqual({ x, y, z: 400 })
    expect(source.gameCoordinate?.z).toBe(300)
  })

  it('preserves height when the map or region cannot be resolved', () => {
    const source = navigationAt('今州城')
    const future = { ...source, stateId: 777 }
    expect(createRoutePlanInput(referenceDataset, [], [future], 777).startPoints[0]?.coordinate.z).toBe(300)
    const unresolved = { ...referenceDataset, regionLabels: [] }
    expect(createRoutePlanInput(unresolved, [], [source], source.stateId).startPoints[0]?.coordinate.z).toBe(300)
  })

  it.each([2, 16, 258])('ignores legacy navigation height when choosing teleports and walks for %i targets', (count) => {
    const marker = navigationAt('今州城')
    const points = Array.from({ length: count }, (_, index) => ({
      ...location, id: `target-${index}`, quality: 'official-provisional' as const,
      coordinate: marker.coordinate,
      gameCoordinate: { x: index < count / 2 ? index + 1 : 1_000 + index - count / 2 + 1, y: 0, z: 0 },
    }))
    const starts = [
      { ...marker, id: 'west', gameCoordinate: { x: 0, y: 0, z: 300 } },
      { ...marker, id: 'east', gameCoordinate: { x: 1_000, y: 0, z: -600 } },
      { ...marker, id: 'far-west', gameCoordinate: { x: -100, y: 0, z: 0 } },
      { ...marker, id: 'far-east', gameCoordinate: { x: 900, y: 0, z: 0 } },
    ]
    const input = createRoutePlanInput(referenceDataset, points, starts, 8)
    const route = optimizeRoute(input)
    expect(route.algorithm).toBe(count <= 15 ? 'exact' : 'nearest-neighbor-2opt')
    expect(route.totalCost).toBe(count)
    expect(route.points.flatMap(({ teleportFrom }) => teleportFrom ? [teleportFrom.id] : []).sort()).toEqual(['east', 'west'])
    const flattened = starts.map((point) => ({ ...point, gameCoordinate: { ...point.gameCoordinate, z: 0 } }))
    expect(optimizeRoute(createRoutePlanInput(referenceDataset, points, flattened, 8))).toEqual(route)
    const distance = route.points.reduce((total, point, index) => {
      const from = point.teleportFrom ?? route.points[index - 1]
      return total + (from ? movementCost(from, point, input) : 0)
    }, 0)
    expect(distance).toBe(route.totalCost)
  })

  it('still uses measured height for Mengzhou navigation and echo points', () => {
    const marker = navigationAt('玄方城')
    const echo = { ...location, coordinate: marker.coordinate, gameCoordinate: { x: 3, y: 4, z: 40 } }
    const low = { ...marker, gameCoordinate: { x: 0, y: 0, z: 0 } }
    const high = { ...marker, gameCoordinate: { x: 0, y: 0, z: 40 } }
    expect(optimizeRoute(createRoutePlanInput(referenceDataset, [echo], [low], 8)).totalCost).toBeCloseTo(Math.hypot(3, 4, 40))
    expect(optimizeRoute(createRoutePlanInput(referenceDataset, [echo], [high], 8)).totalCost).toBe(5)
  })
})
