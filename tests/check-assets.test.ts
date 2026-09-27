import { afterEach, expect, it, vi } from 'vitest'
import { checkAssetUrls } from '../scripts/check-assets.ts'

afterEach(() => vi.unstubAllGlobals())

it('deduplicates URLs and reports HTTP and network failures without skipping remaining assets', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    if (url === 'https://example.test/offline') throw new Error('network unavailable')
    return new Response(null, { status: url === 'https://example.test/missing' ? 404 : 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  const failures = await checkAssetUrls([
    'https://example.test/ok', 'https://example.test/missing',
    'https://example.test/offline', 'https://example.test/ok',
    ...Array.from({ length: 10 }, (_, index) => `https://example.test/${index}`),
  ])
  expect(failures).toEqual([
    { url: 'https://example.test/missing', error: 'HTTP 404' },
    { url: 'https://example.test/offline', error: 'network unavailable' },
  ])
  expect(fetchMock).toHaveBeenCalledTimes(13)
  expect(fetchMock).toHaveBeenCalledWith('https://example.test/ok', {
    method: 'HEAD', signal: expect.any(AbortSignal),
  })
})
