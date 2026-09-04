import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  plugins: [UnoCSS(), vue()],
  worker: {
    format: 'es',
  },
  server: {
    host: true,
  },
})
