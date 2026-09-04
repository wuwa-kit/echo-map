import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'ol/ol.css'
import 'virtual:uno.css'
import App from './App.vue'
import { router } from './router.ts'
import './styles.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

await router.isReady()
app.mount('#app')
