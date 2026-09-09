import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import UnoCSS from 'unocss/vite'
import { pointEditorPlugin } from './scripts/editor-plugin.ts'

export default defineConfig({
  plugins: [UnoCSS(), vue(), pointEditorPlugin()],
  worker: {
    format: 'es',
  },
  server: {
    host: '127.0.0.1',
    port: 8640,
  },
})
