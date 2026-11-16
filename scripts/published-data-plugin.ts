import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { publicDataFilenames } from '../src/data/published-data-png.ts'

export function publishedDataPlugin(): Plugin {
  return {
    name: 'published-data',
    apply: 'build',
    async writeBundle({ dir }) {
      if (!dir) return
      await Promise.all(publicDataFilenames.map(filename => rm(resolve(dir, 'data', filename), { force: true })))
    },
  }
}
