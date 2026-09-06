import { readMapDataset } from '../../scripts/lib/map-data.ts'
import type { AuthoredEchoPoint } from '../../src/domain/types.ts'

export const referenceDataset = await readMapDataset()
const small = referenceDataset.echoes.find(({ cost }) => cost === 1)
const elite = referenceDataset.echoes.find(({ cost }) => cost === 3)
if (!small || !elite) throw new Error('测试数据缺少 C1/C3')
export const smallEcho = small
export const eliteEcho = elite

export function mixedPoint(id = 'mixed-point'): AuthoredEchoPoint {
  return {
    gravityType: null,
    id, kind: 'echo', status: 'verified', stateId: 8, countryId: null, levelId: null,
    coordinate: { x: -497, y: 449, z: 18 },
    members: [{ echoId: smallEcho.id, count: 3 }, { echoId: eliteEcho.id, count: 1 }], note: '实测混合怪群',
  }
}
