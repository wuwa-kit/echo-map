import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const routerSourceUrl = new URL('../src/router.ts', import.meta.url)

describe('application routes', () => {
  it('includes the point editor in production builds', async () => {
    const source = await readFile(routerSourceUrl, 'utf8')
    expect(source).toContain("path: '/editor'")
    expect(source).not.toContain('import.meta.env.DEV')
  })
})
