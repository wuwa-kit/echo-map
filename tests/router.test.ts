import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const routerSourceUrl = new URL('../src/router.ts', import.meta.url)

describe('application routes', () => {
  it('uses the explorer route for both modes', async () => {
    const source = await readFile(routerSourceUrl, 'utf8')
    expect(source).not.toContain("path: '/editor'")
    expect(source).toContain("path: '/'")
    expect(source).not.toContain('import.meta.env.DEV')
  })
})
