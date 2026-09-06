import { describe, expect, it } from 'vitest'
import { cascaderColumns, resolveCascaderChoice, resolveCascaderPath } from '../src/components/base/cascader.ts'
import type { WuCascaderOption } from '../src/components/base/cascader.ts'

const options: readonly WuCascaderOption[] = [
  { value: 'a', label: '一级 A', children: [
    { value: 'a-1', label: '二级 A', children: [
      { value: 'a-1-1', label: '三级 A', children: [{ value: 'destination', label: '四级终点' }] },
    ] },
    { value: 'disabled-leaf', label: '不可选终点', disabled: true },
  ] },
  { value: 'b', label: '一级 B', children: [{ value: 'b-1', label: '二级终点' }] },
  { value: 'disabled', label: '禁用分支', disabled: true, children: [{ value: 'hidden', label: '不可进入' }] },
  { value: 'empty', label: '没有子项的终点', children: [] },
]

describe('WuCascader tree navigation', () => {
  it('expands arbitrary depth and emits a complete path only for the chosen leaf', () => {
    const first = resolveCascaderChoice(options, [], 0, 'a')
    const second = resolveCascaderChoice(options, first?.path ?? [], 1, 'a-1')
    const third = resolveCascaderChoice(options, second?.path ?? [], 2, 'a-1-1')
    expect([first?.kind, second?.kind, third?.kind]).toEqual(['expand', 'expand', 'expand'])
    expect(cascaderColumns(options, third?.path ?? [])).toHaveLength(4)
    expect(resolveCascaderChoice(options, third?.path ?? [], 3, 'destination')).toMatchObject({
      kind: 'select', path: ['a', 'a-1', 'a-1-1', 'destination'],
    })
  })

  it('replaces the old descendant path when a different ancestor is chosen', () => {
    const previous = ['a', 'a-1', 'a-1-1']
    const next = resolveCascaderChoice(options, previous, 0, 'b')
    expect(next?.path).toEqual(['b'])
    expect(previous).toEqual(['a', 'a-1', 'a-1-1'])
    expect(cascaderColumns(options, next?.path ?? []).at(-1)?.options.map(({ value }) => value)).toEqual(['b-1'])
    expect(resolveCascaderChoice(options, next?.path ?? [], 1, 'b-1')?.kind).toBe('select')
  })

  it('trims stale paths, prevents disabled choices, and supports empty data', () => {
    expect(resolveCascaderPath(options, ['a', 'missing', 'a-1-1']).map(({ value }) => value)).toEqual(['a'])
    expect(resolveCascaderPath(options, ['disabled', 'hidden'])).toEqual([])
    expect(resolveCascaderChoice(options, [], 0, 'disabled')).toBeNull()
    expect(resolveCascaderChoice(options, ['a'], 1, 'disabled-leaf')).toBeNull()
    expect(resolveCascaderChoice(options, [], 2, 'destination')).toBeNull()
    expect(resolveCascaderChoice([], [], 0, 'missing')).toBeNull()
    expect(cascaderColumns([], ['a'])).toEqual([{ depth: 0, options: [] }])
  })

  it('allows repeating a leaf action and treats an empty children array as a leaf', () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(resolveCascaderChoice(options, ['b'], 1, 'b-1')).toMatchObject({ kind: 'select', path: ['b', 'b-1'] })
    }
    expect(resolveCascaderChoice(options, [], 0, 'empty')).toMatchObject({ kind: 'select', path: ['empty'] })
    expect(cascaderColumns(options, [])).toHaveLength(1)
  })
})
