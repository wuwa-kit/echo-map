import { onMounted, onScopeDispose } from 'vue'
import { useRouteQuery } from '@vueuse/router'
import { useNavigationIconManagerStore } from '../stores/navigation-icon-manager.ts'

export function useNavigationIconsRouteQuery() {
  const store = useNavigationIconManagerStore()
  const view = useRouteQuery<string>('view', 'categories', { mode: 'replace' })
  const source = useRouteQuery<string>('source', 'all', { mode: 'replace' })
  const status = useRouteQuery<string>('status', 'all', { mode: 'replace' })
  const icon = useRouteQuery<string | undefined>('icon', undefined, { mode: 'replace' })
  const category = useRouteQuery<string>('category', 'all', { mode: 'replace' })
  const binding = {
    read: () => ({ view: view.value, source: source.value, status: status.value, icon: icon.value, category: category.value }),
    write: (query: Record<string, unknown>): void => {
      view.value = typeof query.view === 'string' ? query.view : 'categories'
      source.value = typeof query.source === 'string' ? query.source : 'all'
      status.value = typeof query.status === 'string' ? query.status : 'all'
      icon.value = typeof query.icon === 'string' ? query.icon : undefined
      category.value = typeof query.category === 'string' ? query.category : 'all'
    },
  }
  store.bindQuery(binding)
  onScopeDispose(() => store.unbindQuery(binding))
  onMounted(() => { void store.load() })
}
