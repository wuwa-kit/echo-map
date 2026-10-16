import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useEchoSearchHistoryStore } from '../src/stores/echo-search-history.ts'
import { useExplorerStore } from '../src/stores/explorer.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'

beforeEach(() => {
  setActivePinia(createPinia())
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  })
})
afterEach(() => vi.unstubAllGlobals())

it('keeps the 20 most recently used unique terms and persists removal and reuse', () => {
  const store = useEchoSearchHistoryStore()
  for (let index = 0; index < 22; index += 1) store.record(`搜索 ${index}`)
  expect(store.entries).toHaveLength(20)
  expect(store.entries[0]).toBe('搜索 21')
  expect(store.entries.at(-1)).toBe('搜索 2')
  store.record(' 搜索 5 ')
  expect(store.entries[0]).toBe('搜索 5')
  expect(store.entries.filter(value => value === '搜索 5')).toHaveLength(1)
  store.record('   ')
  expect(store.entries).toHaveLength(20)
  store.remove('搜索 5')
  const expected = [...store.entries]
  setActivePinia(createPinia())
  const restored = useEchoSearchHistoryStore()
  restored.restore()
  expect(restored.entries).toEqual(expected)
})

it('sanitizes saved data and tolerates invalid or unavailable storage', () => {
  localStorage.setItem('echo-map:echo-search-history', JSON.stringify([' 河豚 ', '', 12, null, '河豚', 'C3']))
  const store = useEchoSearchHistoryStore()
  store.restore()
  expect(store.entries).toEqual(['河豚', 'C3'])
  setActivePinia(createPinia())
  localStorage.setItem('echo-map:echo-search-history', '{broken')
  const invalid = useEchoSearchHistoryStore()
  invalid.restore()
  expect(invalid.entries).toEqual([])
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  })
  setActivePinia(createPinia())
  const unavailable = useEchoSearchHistoryStore()
  expect(() => unavailable.record('河豚')).not.toThrow()
  expect(unavailable.entries).toEqual(['河豚'])
})

it('does not record search terms when selecting exploration targets', async () => {
  const explorer = useExplorerStore()
  explorer.setDataset(await readMapDataset())
  const id = explorer.dataset?.echoes[0]?.id
  if (!id) throw new Error('需要声骸')
  const history = useEchoSearchHistoryStore()
  explorer.setEchoSearch('C1')
  explorer.toggleEcho(id)
  explorer.toggleEcho(id)
  explorer.selectCandidateEchoes()
  expect(history.entries).toEqual([])
})
