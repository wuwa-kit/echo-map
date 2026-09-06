import { describe, expect, it } from 'vitest'
import { createRoutePlanInput } from '../src/route/plan-input.ts'
import type { EchoLocation } from '../src/domain/types.ts'

const location: EchoLocation = {
  gravityType: null,
  id: 'echo-point', echoId: 'echo', typeId: 'type', typeName: '声骸', iconUrl: '',
  stateId: 8, countryId: 1, layeredMapId: null, levelId: 'floor',
  coordinate: { rawX: 100, rawY: 200, mapX: 300, mapY: 400 },
  gameCoordinate: { x: 1, y: 2, z: 30 }, quality: 'manual-verified',
}

describe('route input conversion', () => {
  it('preserves independent map XY and authoritative XYZ with floor identity', () => {
    expect(createRoutePlanInput(null, [location], [], 8, 2)).toEqual({
      points: [{
        id: 'echo-point', name: '声骸', echoId: 'echo', stateId: 8, levelId: 'floor',
        coordinate: { x: 1, y: 2, z: 30 }, mapCoordinate: [300, 400],
      }],
      startPoints: [], connectors: [], zWeight: 2,
    })
  })

  it('rejects provisional points instead of deriving Z from map coordinates', () => {
    expect(() => createRoutePlanInput(null, [{ ...location, gameCoordinate: null }], [], 8, 1))
      .toThrow('点位 echo-point 缺少 XYZ')
  })
})
