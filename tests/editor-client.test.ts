import { afterEach, describe, expect, it, vi } from 'vitest'
import { mixedPoint } from './fixtures/point-library.ts'

const cache = new Map<string, string>()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  cache.clear()
})

describe('point editor client', () => {
  it('uses browser persistence and history when the project editor API is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => cache.set(key, value),
    })
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
  })

  it('keeps using the project API when it is available', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
    })
    const apiSnapshot = { library: { version: 1 as const, points: [] }, revision: 'a'.repeat(64) }
    const fetchMock = vi.fn(async () => jsonResponse(apiSnapshot))
    vi.stubGlobal('fetch', fetchMock)
    const client = await import('../src/data/editor-client.ts')

    expect(await client.readEditorLibrary()).toEqual({ ...apiSnapshot, storage: 'project' })
    await client.saveEditorLibrary(apiSnapshot.library, apiSnapshot.revision)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/editor/library', expect.objectContaining({ method: 'PUT' }))
  })
})
