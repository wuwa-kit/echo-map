import { onBeforeUnmount, onMounted } from 'vue'
import { useRouteQuery } from '@vueuse/router'
import { useAssetsStore } from '../stores/assets.ts'

export function useAssetsRouteQuery() {
  const store = useAssetsStore()
  const category = useRouteQuery<string>('category', 'all', { mode: 'replace' })
  const asset = useRouteQuery<string | undefined>('asset', undefined, { mode: 'replace' })
  const binding = {
    read: () => ({ category: category.value, asset: asset.value }),
    write: (query: Record<string, unknown>): void => {
      category.value = typeof query.category === 'string' ? query.category : 'all'
      asset.value = typeof query.asset === 'string' ? query.asset : undefined
    },
  }
  store.bindQuery(binding)
  onBeforeUnmount(() => store.unbindQuery(binding))
  onMounted(() => { void store.load() })
  return { reload: store.load }
}
