import { createApp, h, render } from 'vue'
import { createPinia } from 'pinia'
import 'ol/ol.css'
import { loadPublishedArchive } from './data/fetch-published-data.ts'
import { vTooltip } from './components/base/tooltip.ts'
import './styles.css'

const root = document.querySelector('#app')
if (!root) throw new Error('页面缺少挂载节点')
const statusClass = 'flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center'
render(h('div', { class: statusClass }, '正在装载数据…'), root)

try {
  const [{ default: App }, { router }] = await Promise.all([
    import('./App.vue'),
    import('./router.ts'),
    import.meta.env.PROD ? loadPublishedArchive() : undefined,
  ])
  const app = createApp(App)
  app.directive('tooltip', vTooltip)
  app.use(createPinia())
  app.use(router)

  await router.isReady()
  render(null, root)
  app.mount(root)
} catch (error) {
  console.error(error)
  render(h('div', { class: statusClass }, [
    h('div', '页面加载失败'),
    h('button', {
      class: 'cursor-pointer rounded px-4 py-2 outline -outline-offset-1 outline-[#65f1c2] text-[#65f1c2]',
      onClick: () => location.reload(),
    }, '重新加载'),
  ]), root)
}
