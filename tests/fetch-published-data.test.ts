import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { PNG } from 'pngjs'
import { publicDataFilenames, publishedDataFilenames } from '../src/data/published-data-png.ts'
import { encodePublishedDataPng } from '../scripts/lib/published-data-png.ts'

const url = 'https://prod-alicdn-community.kurobbs.com/forum/published-data-test.png'

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('indexedDB', undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('retries a failed download and shares the decoded PNG across published data requests', async () => {
  const { fetchPublishedData, loadPublishedArchive } = await import('../src/data/fetch-published-data.ts')
  vi.stubEnv('VITE_PUBLISHED_DATA_URL', url)
  vi.stubEnv('DEV', false)
  const archive = Object.fromEntries(publishedDataFilenames.map(filename => [filename, { filename }]))
  const png = encodePublishedDataPng(JSON.stringify(archive), 13, 7)
  const image = PNG.sync.read(png)
  expect([image.width, image.height]).toEqual([13, 7])
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(Uint8Array.from(png)))
  vi.stubGlobal('fetch', fetcher)
  await expect(fetchPublishedData('map-data.json')).rejects.toThrow('发布数据加载失败：503')
  const [loadedArchive, ...publicData] = await Promise.all([
    loadPublishedArchive(),
    ...publicDataFilenames.map(filename => fetchPublishedData(filename)),
  ])
  expect(loadedArchive).toEqual(archive)
  expect(publicData).toEqual(publicDataFilenames.map(filename => archive[filename]))
  expect(await fetchPublishedData('map-data.json')).toEqual(archive['map-data.json'])
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher).toHaveBeenLastCalledWith(url)
})

it('loads decoded data after a reload and replaces the cache when the CDN URL changes', async () => {
  vi.stubEnv('VITE_PUBLISHED_DATA_URL', url)
  vi.stubGlobal('indexedDB', new IDBFactory())
  const archive = Object.fromEntries(publishedDataFilenames.map(filename => [filename, { filename }]))
  const newArchive = { ...archive, 'map-data.json': { filename: 'map-data.json', version: 2 } }
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(Uint8Array.from(encodePublishedDataPng(JSON.stringify(archive)))))
    .mockResolvedValueOnce(new Response(Uint8Array.from(encodePublishedDataPng(JSON.stringify(newArchive)))))
  vi.stubGlobal('fetch', fetcher)

  let loader = await import('../src/data/fetch-published-data.ts')
  expect(await loader.loadPublishedArchive()).toEqual(archive)

  const decompressionStream = globalThis.DecompressionStream
  vi.stubGlobal('DecompressionStream', undefined)
  vi.resetModules()
  loader = await import('../src/data/fetch-published-data.ts')
  expect(await loader.loadPublishedArchive()).toEqual(archive)
  expect(fetcher).toHaveBeenCalledTimes(1)

  vi.stubGlobal('DecompressionStream', decompressionStream)
  const newUrl = url.replace('-test', '-new')
  vi.stubEnv('VITE_PUBLISHED_DATA_URL', newUrl)
  vi.resetModules()
  loader = await import('../src/data/fetch-published-data.ts')
  expect(await loader.loadPublishedArchive()).toEqual(newArchive)
  expect(fetcher.mock.calls).toEqual([[url], [newUrl]])

  vi.resetModules()
  loader = await import('../src/data/fetch-published-data.ts')
  expect(await loader.loadPublishedArchive()).toEqual(newArchive)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('reads current local data without caching during development', async () => {
  const { fetchPublishedData } = await import('../src/data/fetch-published-data.ts')
  vi.stubEnv('VITE_PUBLISHED_DATA_URL', '')
  vi.stubEnv('DEV', true)
  const open = vi.fn()
  vi.stubGlobal('indexedDB', { open })
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  await fetchPublishedData('custom-echo-points.json')
  expect(fetcher).toHaveBeenCalledWith('/data/custom-echo-points.json', { cache: 'no-store' })
  expect(open).not.toHaveBeenCalled()
})
