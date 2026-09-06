import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    ...(import.meta.env.DEV ? [{ path: '/editor', name: 'point-editor', component: () => import('./views/PointEditorView.vue') }] : []),
    {
      path: '/',
      name: 'explorer',
      component: () => import('./views/ExplorerView.vue'),
    },
  ],
})
