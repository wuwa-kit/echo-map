import { describe, expect, it } from 'vitest'
import { findPointDuplicates } from '../src/domain/point-matching.ts'
import { mixedPoint, smallEcho, eliteEcho } from './fixtures/point-library.ts'

describe('point duplicate candidates', () => {
  it('finds candidates with XY only, excludes self and explicit official replacements', () => {
    const target = { ...mixedPoint(), coordinate: { x: 0, y: 0, z: null }, replacesOfficialIds: ['source'] }
    const near = { ...mixedPoint('near'), coordinate: { x: 3, y: 4, z: 500 } }
    const replaced = { ...near, id: 'official', officialIds: ['source'] }
    expect(findPointDuplicates([target, near, replaced], target)).toMatchObject([{ point: { id: 'near' }, distance: 5, heightDifference: null, suspicious: true }])
  })

  it('keeps official placeholder heights and unknown floors but rejects distinct known scopes', () => {
    const target = { ...mixedPoint(), levelId: 'upper', coordinate: { x: 0, y: 0, z: 100 } }
    const base = { ...mixedPoint('near'), coordinate: { x: 0, y: 0, z: 0 } }
    expect(findPointDuplicates([
      { ...base, id: 'official', officialIds: ['source'] },
      { ...base, id: 'high', coordinate: { x: 0, y: 0, z: 109 } },
      { ...base, id: 'lower', levelId: 'lower', coordinate: target.coordinate },
      { ...base, id: 'other-state', stateId: 999, coordinate: target.coordinate },
      { ...base, id: 'other-gravity', gravityType: 1, coordinate: target.coordinate },
    ], target).map(({ point }) => point.id)).toEqual(['official'])
  })

  it('separates nearby unrelated members and includes radius and height boundaries', () => {
    const target = { ...mixedPoint(), members: [{ echoId: smallEcho.id, count: 1 }], coordinate: { x: 0, y: 0, z: 0 } }
    const near = { ...mixedPoint('near'), coordinate: { x: 30, y: 0, z: 8 } }
    expect(findPointDuplicates([near, { ...near, id: 'other', members: [{ echoId: eliteEcho.id, count: 1 }] }, { ...near, id: 'far', coordinate: { x: 31, y: 0, z: 0 } }], target)
      .map(({ point, suspicious }) => [point.id, suspicious])).toEqual([['near', true], ['other', false]])
  })
})
