import { shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { produce } from 'immer'

const STORAGE_KEY = 'echo-map:echo-search-history'
const HISTORY_LIMIT = 20

export const useEchoSearchHistoryStore = defineStore('echo-search-history', () => {
  const entries = shallowRef<readonly string[]>(Object.freeze([]))
  let restored = false

  function restore(): void {
    if (restored) return
    restored = true
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
      if (!Array.isArray(saved)) return
      const values = saved.filter((value): value is string => typeof value === 'string')
        .map(value => value.trim()).filter(Boolean)
      entries.value = Object.freeze([...new Set(values)].slice(0, HISTORY_LIMIT))
    } catch { /* Ignore invalid or unavailable local history. */ }
  }

  function persist(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value)) }
    catch { /* History remains available for this session. */ }
  }

  function record(value: string): void {
    restore()
    const text = value.trim()
    if (!text) return
    entries.value = produce(entries.value, (draft) => {
      const index = draft.indexOf(text)
      if (index !== -1) draft.splice(index, 1)
      draft.unshift(text)
      draft.splice(HISTORY_LIMIT)
    })
    persist()
  }

  function remove(value: string): void {
    restore()
    entries.value = produce(entries.value, (draft) => {
      const index = draft.indexOf(value)
      if (index !== -1) draft.splice(index, 1)
    })
    persist()
  }

  return { entries: shallowReadonly(entries), restore, record, remove }
})
