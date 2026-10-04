// @vitest-environment vue-renderer
import { createRenderer, defineComponent, h, markRaw, nextTick, shallowRef } from 'vue'
import type { ButtonHTMLAttributes, VNodeChild } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WuButton from '../src/components/base/WuButton.vue'
import { vTooltip } from '../src/components/base/tooltip.ts'

vi.mock('../src/components/base/tooltip.ts', () => ({
  vTooltip: { mounted: vi.fn(), updated: vi.fn(), beforeUnmount: vi.fn() },
}))

vi.mock('../src/components/base/WuSvg.vue', () => ({
  default: defineComponent({
    props: { name: String },
    setup: (props) => () => h('svg', { 'data-icon': props.name }),
  }),
}))

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

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function fixture(props: InstanceType<typeof WuButton>['$props'] & ButtonHTMLAttributes & { popovertarget?: string } = {}, slots: Record<string, () => VNodeChild> = { default: () => '保存' }) {
  const state = shallowRef(props)
  const reference = shallowRef<InstanceType<typeof WuButton> | null>(null)
  const onClick = vi.fn()
  const host = new TestNode()
  const app = renderer.createApp({
    setup: () => () => h(WuButton, { ...state.value, ref: reference, onClick }, slots),
  })
  app.mount(host)
  cleanups.push(() => app.unmount())
  const button = host.children[0]
  if (!button) throw new Error('Button did not mount')
  function click(): Event {
    const event = new Event('click', { cancelable: true })
    const handler = button?.props.onClick
    if (typeof handler !== 'function') throw new Error('Button has no click handler')
    handler(event)
    return event
  }
  return { state, reference, button, click, onClick }
}

function descendants(node: TestNode): TestNode[] {
  return [node, ...node.children.flatMap(descendants)]
}

describe('WuButton interactions', () => {
  it('defaults to a non-submitting native button and forwards each click once', () => {
    const { button, click, onClick } = fixture()
    expect(button.tag).toBe('button')
    expect(button.props.type).toBe('button')
    const event = click()
    expect(onClick.mock.calls).toEqual([[event]])
  })

  it.each(['disabled', 'loading'] as const)('blocks clicks while %s and resumes after clearing the state', async (flag) => {
    const { state, button, click, onClick } = fixture({ [flag]: true })
    expect(button.props.disabled).toBe(true)
    expect(click().defaultPrevented).toBe(true)
    expect(onClick).not.toHaveBeenCalled()
    expect(button.props.class).not.toContain('hover:')
    state.value = { [flag]: false }
    await nextTick()
    expect(button.props.disabled).toBe(false)
    click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('retains the same content nodes and root while showing the loading indicator', async () => {
    const { button, state, reference } = fixture({ icon: 'chevron-left' })
    const content = descendants(button).find(({ text }) => text === '保存')
    state.value = { icon: 'chevron-left', loading: true }
    await nextTick()
    expect(descendants(button)).toContain(content)
    expect(descendants(button).some(({ props }) => props['data-icon'] === 'loader')).toBe(true)
    expect(descendants(button).some(({ props }) => String(props.class).includes('invisible'))).toBe(true)
    expect(reference.value?.element).toBe(button)
    state.value = { icon: 'chevron-left' }
    await nextTick()
    expect(descendants(button)).toContain(content)
    expect(descendants(button).some(({ props }) => props['data-icon'] === 'loader')).toBe(false)
  })

  it('keeps icon-only controls square and uses the custom icon slot when supplied', () => {
    const { button } = fixture({ icon: 'close', iconOnly: true, size: 'sm', tooltip: '关闭' }, {
      icon: () => h('svg', { 'data-icon': 'custom' }),
      default: () => '不显示的文本',
    })
    expect(button.props.class).toContain('h-[32px] w-[32px] p-0')
    expect(button.props.title).toBeUndefined()
    expect(button.props.tooltip).toBeUndefined()
    expect(vTooltip.mounted).toHaveBeenCalledWith(button, expect.objectContaining({ value: '关闭' }), expect.anything(), null)
    expect(descendants(button).filter(({ tag }) => tag === 'svg').map(({ props }) => props['data-icon'])).toEqual(['custom'])
    expect(descendants(button).some(({ text }) => text === '不显示的文本')).toBe(false)
  })

  it('exposes the actual button for popover anchoring and forwards native attributes', () => {
    const { button, reference } = fixture({ type: 'submit', id: 'confirm', popovertarget: 'choices', class: 'w-full' })
    expect(reference.value?.element).toBe(button)
    expect(button.props).toMatchObject({ type: 'submit', id: 'confirm', popovertarget: 'choices' })
    expect(button.props.class).toContain('w-full')
  })
})
