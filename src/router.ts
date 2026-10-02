import { createRouter, createWebHistory } from 'vue-router'
import { restoreLastExplorerQuery } from './url/explorer-history.ts'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/assets',
      name: 'official-assets',
      component: () => import('./views/AssetsView.vue'),
    },
    {
      path: '/',
      name: 'explorer',
      component: () => import('./views/ExplorerView.vue'),
    },
  ],
})

router.beforeEach(restoreLastExplorerQuery)
