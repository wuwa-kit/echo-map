import { describe, expect, it } from 'vitest'
import { searchEchoes } from '../src/domain/echo-search.ts'
import type { EchoDefinition } from '../src/domain/types.ts'

const echoes: EchoDefinition[] = [
  { id: 'one', name: '咕咕河豚', cost: 1, sonataIds: ['a', 'b'], iconUrl: '', sourceId: 1 },
  { id: 'two', name: '精英声骸', cost: 3, sonataIds: ['a'], iconUrl: '', sourceId: 2 },
  { id: 'three', name: '其他声骸', cost: 1, sonataIds: ['b'], iconUrl: '', sourceId: 3 },
]

describe('echo editor search', () => {
  it.each([
    ['  ', ['one', 'two', 'three']],
    ['河豚', ['one']],
    ['白霜', []],
    ['裂谷', []],
    [' 精英  c3 ', ['two']],
    ['河豚\tC1', ['one']],
    ['白霜 裂谷', []],
    ['河豚 C3', []],
    ['不存在', []],
  ])('matches %s while preserving catalogue order', (query, ids) => {
    expect(searchEchoes(echoes, query).map(({ id }) => id)).toEqual(ids)
  })
  it('handles unloaded data', () => {
    expect(searchEchoes([], '白霜')).toEqual([])
  })
})
