import { describe, expect, it } from 'vitest'
import { createRoutePlanInput } from '../src/route/plan-input.ts'
import { gameToMapCoordinate } from '../src/map/projection.ts'
import type { EchoLocation, NavigationPoint } from '../src/domain/types.ts'

const location: EchoLocation = {
  gravityType: null,
  id: 'echo-point', echoId: 'echo', typeId: 'type', typeName: '声骸', iconUrl: '',
  stateId: 8, countryId: 1, layeredMapId: null, levelId: 'floor',
  coordinate: { rawX: 100, rawY: 200, mapX: 300, mapY: 400 },
  gameCoordinate: { x: 1, y: 2, z: 30 }, quality: 'manual-verified',
}
const startPoint: NavigationPoint = {
  ...location, groupId: 'beacon', catalogCategoryId: 'navigation', catalogCategoryName: '传送',
  mode: 'fast-travel', kind: 'beacon',
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
})
