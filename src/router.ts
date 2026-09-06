import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/assets',
      name: 'official-assets',
      component: () => import('./views/AssetsView.vue'),
    },
    ...(import.meta.env.DEV ? [{ path: '/editor', name: 'point-editor', component: () => import('./views/PointEditorView.vue') }] : []),
    {
      path: '/',
      name: 'explorer',
      component: () => import('./views/ExplorerView.vue'),
    },
  ],
})
