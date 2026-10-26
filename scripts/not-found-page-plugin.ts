import { copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export function notFoundPagePlugin(): Plugin {
  let outDir = ''

  return {
    name: 'not-found-page',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      await copyFile(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
    },
  }
}
