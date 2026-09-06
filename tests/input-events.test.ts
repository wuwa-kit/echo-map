import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInputEvents } from '../src/components/base/input-events.ts'

class InputElement extends EventTarget {
  value = ''
  isConnected = true
}

beforeEach(() => vi.stubGlobal('HTMLInputElement', InputElement))
afterEach(() => vi.unstubAllGlobals())

function fixture(lazy = false) {
  const state = { modelValue: '1', lazy, disabled: false, readonly: false }
  const target = new InputElement()
  const update = vi.fn<(value: string) => void>()
  const confirm = vi.fn<(value: string) => void>()
  const handlers = createInputEvents(state, { update, confirm })
  return { state, target, update, confirm, handlers }
}

describe('shared input events', () => {
  it('preserves empty and intermediate numeric text for domain validation', () => {
    const { target, update, handlers } = fixture()
    for (const value of ['', '-', '-12', '1.']) {
      target.value = value
      handlers.input({ target })
    }
    expect(update.mock.calls).toEqual([[''], ['-'], ['-12'], ['1.']])
  })

  it('waits for Chinese composition to finish before updating or confirming', () => {
    const { target, update, confirm, handlers } = fixture()
    handlers.compositionStart()
    target.value = 'guai'
    handlers.input({ target })
    handlers.keydown({ target, key: 'Enter', keyCode: 13 })
    expect(update).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()

    target.value = '怪'
    handlers.compositionEnd({ target })
    expect(update).toHaveBeenCalledWith('怪')
    handlers.keydown({ target, key: 'Enter', keyCode: 229 })
    handlers.keydown({ target, key: 'Enter', keyCode: 13, isComposing: true })
    expect(confirm).not.toHaveBeenCalled()
    handlers.keydown({ target, key: 'Enter', keyCode: 13 })
    expect(confirm.mock.calls).toEqual([['怪']])
  })

  it('commits lazy fields only when editing finishes and reflects normalized values', async () => {
    const { state, target, update, handlers } = fixture(true)
    update.mockImplementation((value) => { state.modelValue = String(Number(value)) })
    target.value = '01.50'
    handlers.input({ target })
    expect(update).not.toHaveBeenCalled()
    handlers.change({ target })
    expect(update.mock.calls).toEqual([['01.50']])
    await nextTick()
    expect(target.value).toBe('1.5')
  })

  it('restores the accepted value when a lazy update is rejected without changing the model', async () => {
    const { target, update, handlers } = fixture(true)
    target.value = '99'
    handlers.change({ target })
    expect(update).toHaveBeenCalledWith('99')
    await nextTick()
    expect(target.value).toBe('1')
  })

  it('commits a lazy value before the Enter confirmation action', async () => {
    const { state, target, update, confirm, handlers } = fixture(true)
    update.mockImplementation((value) => { state.modelValue = value })
    confirm.mockImplementation((value) => { expect(state.modelValue).toBe(value) })
    target.value = '2.5'
    handlers.keydown({ target, key: 'Escape', keyCode: 27 })
    expect(update).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    handlers.keydown({ target, key: 'Enter', keyCode: 13 })
    expect(update.mock.calls).toEqual([['2.5']])
    expect(confirm.mock.calls).toEqual([['2.5']])
    await nextTick()
  })

  it.each(['disabled', 'readonly'] as const)('ignores editing and confirmation while %s', (flag) => {
    const { state, target, update, confirm, handlers } = fixture()
    state[flag] = true
    target.value = '2'
    handlers.input({ target })
    handlers.compositionEnd({ target })
    state.lazy = true
    handlers.change({ target })
    handlers.keydown({ target, key: 'Enter', keyCode: 13 })
    expect(update).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })
})
