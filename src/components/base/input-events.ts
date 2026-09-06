import { nextTick } from 'vue'

interface InputState {
  modelValue: string | number | null
  lazy: boolean
  disabled: boolean
  readonly: boolean
}

type InputEventSource = Pick<Event, 'target'> & { isComposing?: boolean }

export function createInputEvents(state: Readonly<InputState>, events: {
  update: (value: string) => void
  confirm: (value: string) => void
}) {
  let composing = false

  function inputTarget(event: InputEventSource): HTMLInputElement | null {
    return !state.disabled && !state.readonly && event.target instanceof HTMLInputElement ? event.target : null
  }

  function input(event: InputEventSource): void {
    const target = inputTarget(event)
    if (target && !state.lazy && !composing && !event.isComposing) events.update(target.value)
  }

  function change(event: InputEventSource): void {
    const target = inputTarget(event)
    if (!target || !state.lazy || composing || event.isComposing) return
    events.update(target.value)
    void nextTick(() => {
      // Commit-mode fields reflect the value accepted or normalized by their owner.
      if (target.isConnected && !composing) target.value = String(state.modelValue ?? '')
    })
  }

  function compositionStart(): void {
    composing = true
  }

  function compositionEnd(event: InputEventSource): void {
    composing = false
    input(event)
  }

  function keydown(event: InputEventSource & Pick<KeyboardEvent, 'key' | 'keyCode'>): void {
    const target = inputTarget(event)
    if (!target || event.key !== 'Enter' || composing || event.isComposing || event.keyCode === 229) return
    change(event)
    events.confirm(target.value)
  }

  return { input, change, compositionStart, compositionEnd, keydown }
}
