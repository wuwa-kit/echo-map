import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { pointEditorPlugin } from './scripts/editor-plugin.ts'

export default defineConfig({
  plugins: [tailwindcss(), vue(), pointEditorPlugin()],
  worker: {
    format: 'es',
  },
  server: {
    host: '127.0.0.1',
    port: 8640,
  },
})
