import { nextTick, shallowRef, watch } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useEqualComputed } from '../src/composables/useEqualComputed.ts'
import { isJsonEqual } from '../src/utils/equal.ts'

describe('isJsonEqual', () => {
  it('compares JSON-like primitives, arrays, and nested objects', () => {
    expect(isJsonEqual(Number.NaN, Number.NaN)).toBe(true)
    expect(isJsonEqual([1, { nested: ['value'] }], [1, { nested: ['value'] }])).toBe(true)
    expect(isJsonEqual([1, 2], [2, 1])).toBe(false)
    expect(isJsonEqual([], {})).toBe(false)
    expect(isJsonEqual({ value: 1 }, { value: 2 })).toBe(false)
  })

  it('treats missing properties and undefined properties as equal', () => {
    expect(isJsonEqual({ value: undefined }, {})).toBe(true)
    expect(isJsonEqual({}, { value: undefined })).toBe(true)
    expect(isJsonEqual({ left: undefined }, { right: undefined })).toBe(true)
    expect(isJsonEqual({}, { value: 1 })).toBe(false)
  })

  it('does not read inherited properties as JSON fields', () => {
    const inheritedValue = Object.create({ value: 1 })
    expect(isJsonEqual({ value: undefined }, inheritedValue)).toBe(true)
  })
})

describe('useEqualComputed', () => {
  it('preserves the previous reference and suppresses equal updates', async () => {
    const source = shallowRef(1)
    const value = useEqualComputed(() => ({ odd: source.value % 2 === 1 }))
    const listener = vi.fn()
    const initialValue = value.value
    watch(value, listener)

    source.value = 3
    await nextTick()

    expect(value.value).toBe(initialValue)
    expect(listener).not.toHaveBeenCalled()

    source.value = 2
    await nextTick()

    expect(value.value).not.toBe(initialValue)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('collects dependencies before returning an equal previous value', async () => {
    const useAlternate = shallowRef(false)
    const primary = shallowRef(1)
    const alternate = shallowRef(1)
    const value = useEqualComputed(() => ({
      value: useAlternate.value ? alternate.value : primary.value,
    }))
    const initialValue = value.value

    useAlternate.value = true
    await nextTick()
    expect(value.value).toBe(initialValue)

    alternate.value = 2
    await nextTick()
    expect(value.value).toEqual({ value: 2 })
    expect(value.value).not.toBe(initialValue)
  })
})
