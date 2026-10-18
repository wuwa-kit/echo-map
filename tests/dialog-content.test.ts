// @vitest-environment vue-renderer
import { createRenderer, h, markRaw, nextTick, shallowRef } from 'vue'
import { expect, it } from 'vitest'
import WuDialogContent from '../src/components/base/WuDialogContent.ts'

class TestNode {
  constructor() { markRaw(this) }
  tag = ''
  text = ''
  parent: TestNode | null = null
  children: TestNode[] = []
  props: Record<string, unknown> = {}
}

function detach(node: TestNode): void {
  if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
  node.parent = null
}

const renderer = createRenderer<TestNode, TestNode>({
  createElement: (tag) => Object.assign(new TestNode(), { tag }),
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


it('preserves the last rendered frame on close and refreshes it on reopening', async () => {
  const open = shallowRef(true)
  const text = shallowRef('第一项')
  const host = new TestNode()
  const app = renderer.createApp({ setup: () => () => h(WuDialogContent, { active: open.value }, { default: () => h('div', text.value) }) })
  app.mount(host)
  const content = () => host.children.find(node => node.tag === 'div')?.text
  expect(content()).toBe('第一项')
  text.value = '第二项'
  await nextTick()
  expect(content()).toBe('第二项')
  open.value = false
  text.value = ''
  await nextTick()
  expect(content()).toBe('第二项')
  text.value = '重新打开'
  open.value = true
  await nextTick()
  expect(content()).toBe('重新打开')
  app.unmount()
})
