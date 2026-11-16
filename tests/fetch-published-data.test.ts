import { afterEach, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { fetchPublishedData, loadPublishedArchive } from '../src/data/fetch-published-data.ts'
import { publicDataFilenames, publishedDataFilenames } from '../src/data/published-data-png.ts'
import { encodePublishedDataPng } from '../scripts/lib/published-data-png.ts'

const url = 'https://prod-alicdn-community.kurobbs.com/forum/published-data-test.png'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('retries a failed download and shares the decoded PNG across published data requests', async () => {
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

it('reads current local data without caching during development', async () => {
  vi.stubEnv('VITE_PUBLISHED_DATA_URL', '')
  vi.stubEnv('DEV', true)
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  await fetchPublishedData('custom-echo-points.json')
  expect(fetcher).toHaveBeenCalledWith('/data/custom-echo-points.json', { cache: 'no-store' })
})
