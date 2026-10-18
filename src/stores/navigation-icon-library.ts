import { builtInIconType } from '../domain/navigation-point-types.ts'
import { computed, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Draft } from 'immer'
import { freeze, produce } from 'immer'
import { initialNavigationIconLibrary, buildNavigationIconCatalog } from '../domain/navigation-icon-catalog.ts'
import { orderedIconCategories, validateIconLibraryUpdate } from '../domain/navigation-icon-library.ts'
import type { NavigationIconLibrary } from '../domain/types.ts'
import { readNavigationIconLibrary } from '../data/navigation-icon-client.ts'
import { navigationIconPool, officialIconPool } from '../domain/navigation-icon-pool.ts'

export const useNavigationIconLibraryStore = defineStore('navigation-icon-library', () => {
  const saved = shallowRef<NavigationIconLibrary>(freeze(initialNavigationIconLibrary, true))
  const draft = shallowRef<NavigationIconLibrary>(saved.value)
  const catalog = computed(() => freeze(buildNavigationIconCatalog(saved.value), true))
  const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(saved.value))
  const pool = computed(() => navigationIconPool(draft.value))

  const categories = computed(() => orderedIconCategories(draft.value.categories))
  function acknowledgeOrder(value: unknown, id: string, order: number): void {
    saved.value = freeze(validateIconLibraryUpdate(value, saved.value), true)
    draft.value = produce(draft.value, next => {
      const category = next.categories.find(category => category.id === id)
      if (category) category.order = order
    })
  }
  function acknowledgeOperation(value: unknown, update: (next: Draft<NavigationIconLibrary>) => void): void {
    saved.value = freeze(validateIconLibraryUpdate(value, saved.value), true)
    draft.value = produce(draft.value, update)
  }
  function accept(value: unknown): void {
    saved.value = freeze(validateIconLibraryUpdate(value, initialNavigationIconLibrary), true)
    draft.value = saved.value
  }
  function acknowledge(value: unknown, submitted: NavigationIconLibrary): void {
    const latest = draft.value
    saved.value = freeze(validateIconLibraryUpdate(value, initialNavigationIconLibrary), true)
    draft.value = latest === submitted ? saved.value : latest
  }
  function importDraft(value: unknown): void {
    draft.value = freeze(validateIconLibraryUpdate(value, saved.value), true)
  }
  function rename(id: string, name: string): void {
    draft.value = produce(draft.value, next => {
      const icon = next.icons.find(icon => icon.id === id)
      if (icon) icon.name = name.slice(0, 200)
      else if (officialIconPool.some(icon => icon.id === id)) {
        let entry = next.overrides.find(entry => entry.id === id)
        if (!entry) { entry = { id }; next.overrides.push(entry) }
        entry.name = name.slice(0, 200)
      }
    })
  }
  function discard(): void { draft.value = saved.value }
  function discardIconNames(ids: readonly string[]): void {
    draft.value = produce(draft.value, next => {
      for (const id of ids) {
        const icon = next.icons.find(icon => icon.id === id)
        const original = saved.value.icons.find(icon => icon.id === id)
        if (icon && original) icon.name = original.name
        else {
          const override = saved.value.overrides.find(entry => entry.id === id)
          const index = next.overrides.findIndex(entry => entry.id === id)
          if (index < 0) continue
          if (override) next.overrides[index] = { ...override }
          else next.overrides.splice(index, 1)
        }
      }
    })
  }
  function createCategory(name: string): string {
    const value = name.trim()
    if (!value || value.length > 100 || draft.value.categories.some(category => category.name === value)) throw new Error('分类名称不能为空、重复或超过 100 字')
    if (draft.value.categories.length >= 100) throw new Error('最多支持 100 个分类')
    const id = `category-${crypto.randomUUID()}`
    const order = Math.max(0, ...draft.value.categories.map((category, index) => category.order ?? index * 1024)) + 1024
    draft.value = produce(draft.value, next => { next.categories.push({ id, name: value, order, icons: [] }) })
    return id
  }
  function renameCategory(id: string, name: string): void {
    if (id === 'unclassified') return
    const value = name.trim()
    if (!value || value.length > 100 || draft.value.categories.some(category => category.id !== id && category.name === value)) throw new Error('分类名称不能为空、重复或超过 100 字')
    draft.value = produce(draft.value, next => { const category = next.categories.find(category => category.id === id); if (category) category.name = value })
  }
  function deleteCategory(id: string): void {
    if (id === 'unclassified') return
    draft.value = produce(draft.value, next => { next.categories = next.categories.filter(category => category.id !== id) })
  }
  function addToCategory(id: string, iconIds: readonly string[]): void {
    const validIds = new Set(pool.value.filter(icon => icon.source !== 'placeholder' && (builtInIconType(icon.id)?.icons.length ?? 0) <= 1).map(icon => icon.id))
    draft.value = produce(draft.value, next => {
      const category = next.categories.find(category => category.id === id)
      if (!category) return
      for (const iconId of iconIds) if (validIds.has(iconId) && !next.categories.some(item => item.icons.some(icon => icon.iconId === iconId))) category.icons.push({ iconId })
    })
  }
  function removeFromCategory(id: string, iconIds: readonly string[]): void {
    const removed = new Set(iconIds)
    draft.value = produce(draft.value, next => { const category = next.categories.find(category => category.id === id); if (category) category.icons = category.icons.filter(icon => !removed.has(icon.iconId)) })
  }
  async function refresh(): Promise<void> {
    if (dirty.value) return
    try {
      const snapshot = await readNavigationIconLibrary()
      if (snapshot && !dirty.value) accept(snapshot.library)
    } catch { /* Offline pages continue using their bundled icon library. */ }
  }
  return { acknowledgeOperation, saved: shallowReadonly(saved), draft: shallowReadonly(draft), catalog, pool, categories, dirty, acknowledgeOrder, acknowledge, accept, importDraft, rename, discard, discardIconNames, refresh, createCategory, renameCategory, deleteCategory, addToCategory, removeFromCategory }
})
