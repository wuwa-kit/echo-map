// @vitest-environment vue-renderer
import { createRenderer, h, markRaw, nextTick, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WuMessage from '../src/components/base/WuMessage.vue'

class TestNode {
  constructor() { markRaw(this) }
  text = ''
  parent: TestNode | null = null
  children: TestNode[] = []
  props: Record<string, unknown> = {}
  open = false
  get isConnected(): boolean { return this.parent !== null }
  matches(selector: string): boolean { return selector === ':popover-open' && this.open }
  showPopover(): void { this.open = true }
  hidePopover(): void { this.open = false }
}

function detach(node: TestNode): void {
  if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
  node.parent = null
}

const renderer = createRenderer<TestNode, TestNode>({
  createElement: () => new TestNode(),
  createText: (text) => Object.assign(new TestNode(), { text }),
  createComment: () => new TestNode(),
  setText: (node, text) => { node.text = text },
  setElementText: (node, text) => { node.children = []; node.text = text },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[(node.parent?.children.indexOf(node) ?? -1) + 1] ?? null,
  patchProp: (node, key, _previous, next: unknown) => { node.props[key] = next },
  insert: (node, parent, anchor) => {
    detach(node)
    node.parent = parent
    parent.children.splice(anchor ? parent.children.indexOf(anchor) : parent.children.length, 0, node)
  },
  remove: detach,
})
const cleanups: (() => void)[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('HTMLElement', TestNode)
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function fixture(duration = 3500) {
  const message = shallowRef('保存成功')
  const onClose = vi.fn()
  const host = new TestNode()
  const app = renderer.createApp({ setup: () => () => h(WuMessage, { message: message.value, duration, onClose }) })
  app.mount(host)
  cleanups.push(() => app.unmount())
  await nextTick()
  const panel = host.children[0]
  if (!panel) throw new Error('Message did not mount')
  return { panel, message, onClose }
}

describe('WuMessage', () => {
  it('opens on its first mount and closes after the display duration', async () => {
    const { panel, onClose } = await fixture()
    expect(panel.open).toBe(true)
    await vi.advanceTimersByTimeAsync(3499)
    expect(panel.open).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(panel.open).toBe(false)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('reopens the same message and restarts its display duration', async () => {
    const { panel, message, onClose } = await fixture()
    await vi.advanceTimersByTimeAsync(3000)
    message.value = ''
    await nextTick()
    expect(panel.open).toBe(false)
    message.value = '保存成功'
    await nextTick()
    expect(panel.open).toBe(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(panel.open).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3000)
    expect(panel.open).toBe(false)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps a persistent message open until its content is cleared', async () => {
    const { panel, message, onClose } = await fixture(0)
    expect(panel.open).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(panel.open).toBe(true)
    message.value = ''
    await nextTick()
    expect(panel.open).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })

})
