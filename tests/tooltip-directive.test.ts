// @vitest-environment vue-renderer
import { render } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { vTooltip } from '../src/components/base/tooltip.ts'
import type { WuTooltipValue } from '../src/components/base/tooltip.ts'

vi.mock('vue', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue')>(),
  render: vi.fn(),
}))

class TestElement extends EventTarget {
  ownerDocument = document
  className = ''
  remove = vi.fn()
}

const append = vi.fn()
const elements: TestElement[] = []
beforeEach(() => {
  vi.clearAllMocks()
  elements.length = 0
  vi.stubGlobal('document', {
    body: { append },
    createElement: () => {
      const element = new TestElement()
      elements.push(element)
      return element
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

function invoke(name: 'mounted' | 'updated' | 'beforeUnmount', element: HTMLElement, value?: WuTooltipValue): void {
  if (name === 'beforeUnmount') vTooltip.beforeUnmount(element)
  else vTooltip[name](element, { value, oldValue: undefined, instance: null, dir: vTooltip, modifiers: {} })
}

describe('tooltip directive lifecycle', () => {
  it('does not mount panels for empty hints', () => {
    const element = document.createElement('button')
    invoke('mounted', element, undefined)
    invoke('updated', element, '  ')
    invoke('beforeUnmount', element)
    expect(append).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  })

  it('reuses the panel while updating its text, anchor and options', () => {
    const element = document.createElement('button')
    invoke('mounted', element, '展开面板')
    const first = vi.mocked(render).mock.calls[0]
    expect(first?.[0]?.props).toMatchObject({ content: '展开面板', anchor: element })
    invoke('updated', element, { content: '收起面板', placement: 'left', delayEnter: 0 })
    const updated = vi.mocked(render).mock.calls[1]
    expect(updated?.[0]?.props).toMatchObject({ content: '收起面板', anchor: element, placement: 'left', delayEnter: 0 })
    expect(updated?.[1]).toBe(first?.[1])
    expect(append).toHaveBeenCalledTimes(1)
    invoke('beforeUnmount', element)
  })

  it('unmounts the tooltip and removes its host when the hint or target disappears', () => {
    const element = document.createElement('button')
    invoke('mounted', element, '提示')
    const firstHost = elements[1]
    invoke('updated', element, '')
    expect(render).toHaveBeenLastCalledWith(null, firstHost)
    expect(firstHost?.remove).toHaveBeenCalledTimes(1)
    invoke('updated', element, '新提示')
    const nextHost = elements[2]
    expect(nextHost).not.toBe(firstHost)
    invoke('beforeUnmount', element)
    expect(render).toHaveBeenLastCalledWith(null, nextHost)
    expect(nextHost?.remove).toHaveBeenCalledTimes(1)
    invoke('beforeUnmount', element)
    expect(nextHost?.remove).toHaveBeenCalledTimes(1)
  })

  it('keeps each target independent and passes strings as text content', () => {
    const first = document.createElement('button')
    const second = document.createElement('input')
    invoke('mounted', first, '<img src=x>')
    invoke('mounted', second, '坐标')
    const calls = vi.mocked(render).mock.calls
    expect(calls[0]?.[0]?.props).toMatchObject({ content: '<img src=x>', anchor: first })
    expect(calls[0]?.[0]?.props).not.toHaveProperty('innerHTML')
    expect(calls[0]?.[1]).not.toBe(calls[1]?.[1])
    invoke('beforeUnmount', first)
    expect(elements[3]?.remove).not.toHaveBeenCalled()
    invoke('beforeUnmount', second)
  })
})
