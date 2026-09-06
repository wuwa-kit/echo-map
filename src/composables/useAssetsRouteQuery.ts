import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteUpdate } from 'vue-router'
import { useRouteQuery } from '@vueuse/router'
import { useAssetsStore } from '../stores/assets.ts'

export function useAssetsRouteQuery() {
  const store = useAssetsStore()
  const category = useRouteQuery<string>('category', 'all', { mode: 'replace' })
  const map = useRouteQuery<string | undefined>('map', undefined, { mode: 'replace' })
  const page = useRouteQuery<string>('page', '1', { mode: 'replace' })
  const asset = useRouteQuery<string | undefined>('asset', undefined, { mode: 'replace' })
  let active = true
  onBeforeUnmount(() => { active = false })

  function write(): void {
    category.value = store.filters.category
    map.value = store.filters.stateId === null ? undefined : String(store.filters.stateId)
    page.value = String(store.page)
    asset.value = store.filters.selectedId ?? undefined
  }

  async function reload(): Promise<void> {
    await store.load()
    if (!active || store.error) return
    store.restoreQuery({ category: category.value, map: map.value, page: page.value, asset: asset.value })
    write()
  }

  onMounted(() => {
    store.resetFilters()
    void reload()
  })
  onBeforeRouteUpdate((to) => {
    if (store.dataset) store.restoreQuery(to.query)
  })

  return { write, reload }
}
