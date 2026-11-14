import { afterEach, expect, it, vi } from 'vitest'
import { fetchPublishedData } from '../src/data/fetch-published-data.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('loads published JSON from the versioned CDN with caching enabled', async () => {
  vi.stubEnv('VITE_CDN_BASE', 'https://cdn.example.com/page-123/')
  vi.stubEnv('DEV', false)
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  await fetchPublishedData('map-data.json')
  expect(fetcher).toHaveBeenCalledWith('https://cdn.example.com/page-123/data/map-data.json', { cache: 'default' })
})

it('reads current local data without caching during development', async () => {
  vi.stubEnv('VITE_CDN_BASE', '')
  vi.stubEnv('DEV', true)
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  await fetchPublishedData('custom-echo-points.json')
  expect(fetcher).toHaveBeenCalledWith('/data/custom-echo-points.json', { cache: 'no-store' })
})
