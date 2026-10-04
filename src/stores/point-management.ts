import { defineStore } from 'pinia'
import { shallowReadonly, shallowRef } from 'vue'
import { produce } from 'immer'

export type PointManagementAction = 'delete' | 'published' | 'local' | 'cleanup'

export const usePointManagementStore = defineStore('point-management', () => {
  const search = shallowRef('')
  const selected = shallowRef<string[]>([])
  const detailId = shallowRef<string | null>(null)
  const pending = shallowRef<{ action: PointManagementAction; ids: string[] } | null>(null)
  function resetSelection(): void {
    selected.value = []
    detailId.value = null
    pending.value = null
  }
  return {
    search: shallowReadonly(search), selected: shallowReadonly(selected), detailId: shallowReadonly(detailId), pending: shallowReadonly(pending),
    resetSelection,
    reset: () => { search.value = ''; resetSelection() },
    setSearch: (value: string) => { search.value = value; resetSelection() },
    showDetail: (id: string | null) => { detailId.value = id },
    toggle: (id: string, checked: boolean) => { selected.value = produce(selected.value, ids => { if (checked && !ids.includes(id)) ids.push(id); else if (!checked) return ids.filter(value => value !== id) }) },
    selectMany: (ids: string[], checked: boolean) => {
      const scope = new Set(ids)
      selected.value = produce(selected.value, selection => {
        if (!checked) return selection.filter(id => !scope.has(id))
        const existing = new Set(selection)
        for (const id of scope) if (!existing.has(id)) selection.push(id)
      })
    },
    requestAction: (action: PointManagementAction, ids: string[]) => { pending.value = { action, ids: [...ids] } },
    cancelAction: () => { pending.value = null },
  }
})
