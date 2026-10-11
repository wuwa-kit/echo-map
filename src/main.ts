import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'ol/ol.css'
import App from './App.vue'
import { router } from './router.ts'
import { vTooltip } from './components/base/tooltip.ts'
import './styles.css'

const app = createApp(App)
app.directive('tooltip', vTooltip)
app.use(createPinia())
app.use(router)

await router.isReady()
app.mount('#app')
