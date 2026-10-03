import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb'
import { initializeBrowserPointLibrary, readBrowserPointSnapshot, readBrowserPointVersion, readBrowserPointVersions, saveBrowserPointLibrary } from '../src/data/browser-point-repository.ts'
import { mixedPoint } from './fixtures/point-library.ts'
import type { PointLibrary } from '../src/domain/types.ts'

function library(note = ''): PointLibrary {
  return { version: 1, points: [{ ...mixedPoint(), note }] }
}

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('IndexedDB point repository', () => {
  it('initializes once across concurrent pages without overwriting an existing library', async () => {
    expect(await readBrowserPointSnapshot()).toBeNull()
    const [first, second] = await Promise.all([
      initializeBrowserPointLibrary(library('first page')),
      initializeBrowserPointLibrary(library('second page')),
    ])
    expect(first).toEqual(second)
    expect(await readBrowserPointSnapshot()).toEqual(first)
    expect(await initializeBrowserPointLibrary(library('new published data'))).toEqual(first)
    expect(await readBrowserPointVersions()).toEqual([])
  })

  it('atomically rejects concurrent saves based on the same revision', async () => {
    const initial = await initializeBrowserPointLibrary(library())
    const results = await Promise.allSettled([
      saveBrowserPointLibrary(library('first change'), initial.revision),
      saveBrowserPointLibrary(library('second change'), initial.revision),
    ])
    const saved = results.find((result) => result.status === 'fulfilled')
    const rejected = results.find((result) => result.status === 'rejected')
    expect(saved?.status).toBe('fulfilled')
    expect(rejected?.status).toBe('rejected')
    if (saved?.status !== 'fulfilled' || rejected?.status !== 'rejected') throw new Error('Expected one committed save and one revision conflict')
    expect(rejected.reason).toBeInstanceOf(Error)
    expect(String(rejected.reason)).toContain('其他页面更新')
    expect(await readBrowserPointSnapshot()).toEqual(saved.value)
    expect(await readBrowserPointVersions()).toEqual([{ revision: initial.revision, savedAt: expect.any(String) }])
    expect(await readBrowserPointVersion(initial.revision)).toEqual(initial.library)
  })

  it('keeps the most recent 50 versions in commit order and removes their expired snapshots', async () => {
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-10-04T00:00:00.000Z')
    const initial = await initializeBrowserPointLibrary(library('initial'))
    let current = initial
    const revisions: string[] = []
    for (let index = 0; index < 52; index += 1) {
      revisions.push(current.revision)
      current = await saveBrowserPointLibrary(library(String(index)), current.revision)
    }
    const versions = await readBrowserPointVersions()
    expect(versions.map(({ revision }) => revision)).toEqual(revisions.slice(-50).reverse())
    expect(versions.every((version) => !('library' in version))).toBe(true)
    await expect(readBrowserPointVersion(initial.revision)).rejects.toThrow('找不到')
    const latest = versions[0]
    if (!latest) throw new Error('Expected a saved version')
    expect(await readBrowserPointVersion(latest.revision)).toEqual(library('50'))
    expect(await readBrowserPointSnapshot()).toEqual(current)
  })

  it('rolls back library and history together if a transaction aborts after successful write requests', async () => {
    const initial = await initializeBrowserPointLibrary(library('before failure'))
    const originalAdd = FakeObjectStore.prototype.add
    const failure = vi.spyOn(FakeObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = originalAdd.call(this, value, key)
      if (this.name === 'versions') request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    await expect(saveBrowserPointLibrary(library('failed change'), initial.revision)).rejects.toThrow()
    failure.mockRestore()
    expect(await readBrowserPointSnapshot()).toEqual(initial)
    expect(await readBrowserPointVersions()).toEqual([])
    await expect(readBrowserPointVersion(initial.revision)).rejects.toThrow('找不到')
    const retried = await saveBrowserPointLibrary(library('retry'), initial.revision)
    expect(await readBrowserPointSnapshot()).toEqual(retried)
  })

  it('stores point libraries larger than typical localStorage capacity without serializing them there', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('localStorage unavailable') },
      setItem: () => { throw new Error('localStorage full') },
    })
    const initial = await initializeBrowserPointLibrary(library())
    const large: PointLibrary = { version: 1, points: Array.from({ length: 2600 }, (_, index) => ({ ...mixedPoint(`point:${index}`), note: 'x'.repeat(2000) })) }
    expect(JSON.stringify(large).length).toBeGreaterThan(5 * 1024 * 1024)
    const saved = await saveBrowserPointLibrary(large, initial.revision)
    expect((await readBrowserPointSnapshot())?.library).toEqual(large)
    expect(await readBrowserPointVersion(initial.revision)).toEqual(initial.library)
    expect(saved.revision).not.toBe(initial.revision)
  })

  it('reports unavailable storage and allows retrying once IndexedDB is available', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(readBrowserPointSnapshot()).rejects.toThrow('IndexedDB')
    vi.stubGlobal('indexedDB', new IDBFactory())
    expect(await readBrowserPointSnapshot()).toBeNull()
    const initial = await initializeBrowserPointLibrary(library())
    expect(await readBrowserPointSnapshot()).toEqual(initial)
  })
})
