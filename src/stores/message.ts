import { shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'

export const useMessageStore = defineStore('message', () => {
  const message = shallowRef('')
  const tone = shallowRef<'error' | 'success'>('error')
  const sequence = shallowRef(0)
  function dismiss(): void { message.value = '' }
  function showError(value: string): void { tone.value = 'error'; message.value = value; sequence.value += 1 }
  function showSuccess(value: string): void { tone.value = 'success'; message.value = value; sequence.value += 1 }
  return { message: shallowReadonly(message), tone: shallowReadonly(tone), sequence: shallowReadonly(sequence), showError, showSuccess, dismiss }
})
