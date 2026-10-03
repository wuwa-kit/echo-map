import { createVNode, render } from 'vue'
import type { DirectiveBinding, ObjectDirective } from 'vue'
import WuTooltip from './WuTooltip.vue'
import type { WuTooltipPlacement } from './tooltip-position.ts'

export interface WuTooltipOptions {
  content: string
  disabled?: boolean
  placement?: WuTooltipPlacement
  delayEnter?: number
  gap?: number
  viewportMargin?: number
  maxWidth?: number
}

export type WuTooltipValue = string | WuTooltipOptions | null | undefined

const hosts = new WeakMap<HTMLElement, HTMLElement>()

function dispose(element: HTMLElement): void {
  const host = hosts.get(element)
  if (!host) return
  render(null, host)
  host.remove()
  hosts.delete(element)
}

function update(element: HTMLElement, value: WuTooltipValue): void {
  const options = typeof value === 'string' ? { content: value } : value
  if (!options?.content.trim()) {
    dispose(element)
    return
  }
  let host = hosts.get(element)
  if (!host) {
    host = element.ownerDocument.createElement('div')
    host.className = 'contents'
    element.ownerDocument.body.append(host)
    hosts.set(element, host)
  }
  render(createVNode(WuTooltip, { ...options, anchor: element }), host)
}

export const vTooltip = {
  mounted: (element: HTMLElement, { value }: DirectiveBinding<WuTooltipValue>) => update(element, value),
  updated: (element: HTMLElement, { value }: DirectiveBinding<WuTooltipValue>) => update(element, value),
  beforeUnmount: dispose,
} satisfies ObjectDirective<HTMLElement, WuTooltipValue>
