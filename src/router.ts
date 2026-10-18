import { createRouter, createWebHistory } from 'vue-router'
import { createExplorerEntryGuard } from './url/explorer-history.ts'
import { useExplorerSessionStore } from './stores/explorer-session.ts'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/navigation-icons',
      name: 'navigation-icons',
      component: () => import('./views/NavigationIconsView.vue'),
    },
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

router.beforeResolve(to => createExplorerEntryGuard(useExplorerSessionStore())(to))
