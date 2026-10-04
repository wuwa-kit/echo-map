import { defineStore } from 'pinia'
import { shallowReadonly, shallowRef } from 'vue'
import { produce } from 'immer'

export type PointManagementAction = 'delete' | 'published' | 'local' | 'cleanup'

export const usePointManagementStore = defineStore('point-management', () => {
  const search = shallowRef('')
  const selected = shallowRef<string[]>([])
  const detailId = shallowRef<string | null>(null)
  const page = shallowRef(1)
  const pending = shallowRef<{ action: PointManagementAction; ids: string[] } | null>(null)
  function resetSelection(): void {
    selected.value = []
    detailId.value = null
    pending.value = null
    page.value = 1
  }
  return {
    search: shallowReadonly(search), selected: shallowReadonly(selected), detailId: shallowReadonly(detailId), page: shallowReadonly(page), pending: shallowReadonly(pending),
    resetSelection,
    reset: () => { search.value = ''; resetSelection() },
    setSearch: (value: string) => { search.value = value; resetSelection() },
    setPage: (value: number) => { page.value = Math.max(1, value) },
    showDetail: (id: string | null) => { detailId.value = id },
    toggle: (id: string, checked: boolean) => { selected.value = produce(selected.value, ids => { if (checked && !ids.includes(id)) ids.push(id); else if (!checked) return ids.filter(value => value !== id) }) },
    selectMany: (ids: string[], checked: boolean) => { selected.value = checked ? [...new Set([...selected.value, ...ids])] : selected.value.filter(id => !ids.includes(id)) },
    requestAction: (action: PointManagementAction, ids: string[]) => { pending.value = { action, ids: [...ids] } },
    cancelAction: () => { pending.value = null },
  }
})
