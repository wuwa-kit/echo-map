import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { mixedPoint } from './fixtures/point-library.ts'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('Point libraries must not use localStorage') },
    setItem: () => { throw new Error('Point libraries must not use localStorage') },
  })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('point editor client', () => {
  it('uses browser persistence and history when the project editor API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const path = String(input)
      if (path === '/api/editor/library') return jsonResponse({ error: '不存在的录入接口' }, 404)
      if (path === '/data/custom-echo-points.json') return jsonResponse({ version: 1, points: [mixedPoint()] })
      if (path === '/data/custom-navigation-points.json') return jsonResponse({ version: 1, points: [] })
      throw new Error(`Unexpected request: ${path}`)
    }))
    const client = await import('../src/data/editor-client.ts')

    const initial = await client.readEditorLibrary()
    expect(initial).toMatchObject({ storage: 'browser', library: { points: [{ id: 'mixed-point' }] } })

    const updatedLibrary = { version: 1 as const, points: [{ ...mixedPoint(), note: '线上录入' }] }
    const saved = await client.saveEditorLibrary(updatedLibrary, initial.revision)
    expect(saved).toMatchObject({ storage: 'browser', library: updatedLibrary })
    expect((await client.readEditorLibrary()).library).toEqual(updatedLibrary)

    const versions = await client.readEditorVersions()
    expect(versions).toHaveLength(1)
    expect(await client.readEditorVersion(versions[0]?.revision ?? '')).toEqual(initial.library)
    vi.resetModules()
    const reopened = await import('../src/data/editor-client.ts')
    expect(await reopened.readEditorLibrary()).toEqual(saved)
    expect(await reopened.readEditorVersions()).toEqual(versions)
  })

  it('keeps using the project API when it is available', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const apiSnapshot = { library: { version: 1 as const, points: [] }, revision: 'a'.repeat(64) }
    const fetchMock = vi.fn(async () => jsonResponse(apiSnapshot))
    vi.stubGlobal('fetch', fetchMock)
    const client = await import('../src/data/editor-client.ts')

    expect(await client.readEditorLibrary()).toEqual({ ...apiSnapshot, storage: 'project' })
    await client.saveEditorLibrary(apiSnapshot.library, apiSnapshot.revision)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/editor/library', expect.objectContaining({ method: 'PUT' }))
  })

  it('reports browser database failures without pretending that the point library was saved', async () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: '不存在的录入接口' }, 404)))
    const client = await import('../src/data/editor-client.ts')
    await expect(client.readEditorLibrary()).rejects.toThrow('IndexedDB')
    await expect(client.saveEditorLibrary({ version: 1, points: [] }, 'missing')).rejects.toThrow('IndexedDB')
  })

  it('does not switch storage when a project save fails', async () => {
    const apiSnapshot = { library: { version: 1 as const, points: [] }, revision: 'a'.repeat(64) }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(apiSnapshot))
      .mockResolvedValueOnce(jsonResponse({ error: '数据已被其他页面修改' }, 409))
    vi.stubGlobal('fetch', fetchMock)
    const client = await import('../src/data/editor-client.ts')
    await client.readEditorLibrary()
    await expect(client.saveEditorLibrary(apiSnapshot.library, apiSnapshot.revision)).rejects.toThrow('其他页面修改')
    const { readBrowserPointSnapshot } = await import('../src/data/browser-point-repository.ts')
    expect(await readBrowserPointSnapshot()).toBeNull()
  })
})
