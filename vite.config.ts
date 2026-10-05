import { execFileSync } from 'node:child_process'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { pointEditorPlugin } from './scripts/editor-plugin.ts'

export default defineConfig({
  define: {
    __LAST_COMMIT_TIME__: JSON.stringify(execFileSync('git', ['log', '-1', '--format=%cI'], {
      cwd: import.meta.dirname,
      encoding: 'utf8',
    }).trim()),
  },
  plugins: [tailwindcss(), vue(), pointEditorPlugin()],
  worker: {
    format: 'es',
  },
  server: {
    host: '127.0.0.1',
    port: 8640,
  },
})
