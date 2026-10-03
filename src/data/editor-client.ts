import { z } from 'zod'
import { combinePointLibraryKinds } from '../domain/point-library.ts'
import { echoPointLibrarySchema, navigationPointLibrarySchema, pointLibrarySchema } from '../domain/schema.ts'
import type { PointLibrary } from '../domain/types.ts'
import { editorSnapshotSchema, initializeBrowserPointLibrary, readBrowserPointSnapshot, readBrowserPointVersion, readBrowserPointVersions, saveBrowserPointLibrary } from './browser-point-repository.ts'

const versionsSchema = z.array(z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/u), savedAt: z.string() }))
type EditorStorage = 'project' | 'browser'
type EditorSnapshot = z.infer<typeof editorSnapshotSchema> & { storage: EditorStorage }
let activeStorage: EditorStorage | null = null

class EditorApiUnavailableError extends Error {}

async function request(path: string, options?: RequestInit): Promise<unknown> {
  let response: Response
  try { response = await fetch(`/api/editor/${path}`, options) }
  catch { throw new EditorApiUnavailableError('录入接口不可用') }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new EditorApiUnavailableError('录入接口不可用')
  const body: unknown = await response.json().catch(() => { throw new EditorApiUnavailableError('录入接口不可用') })
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body)
    if ([403, 404, 405].includes(response.status)) throw new EditorApiUnavailableError(error.success ? error.data.error : '录入接口不可用')
    throw new Error(error.success ? error.data.error : `保存失败：${response.status}`)
  }
  return body
}

async function publishedLibrary(): Promise<PointLibrary> {
  const [echoResponse, navigationResponse] = await Promise.all([
    fetch('/data/custom-echo-points.json', { cache: 'no-store' }),
    fetch('/data/custom-navigation-points.json', { cache: 'no-store' }),
  ])
  if (!echoResponse.ok || !navigationResponse.ok) throw new Error('线上点位库加载失败')
  return combinePointLibraryKinds(
    echoPointLibrarySchema.parse(await echoResponse.json()),
    navigationPointLibrarySchema.parse(await navigationResponse.json()),
  )
}

async function readBrowserLibrary(): Promise<EditorSnapshot> {
  const snapshot = await readBrowserPointSnapshot() ?? await initializeBrowserPointLibrary(await publishedLibrary())
  return { ...snapshot, storage: 'browser' }
}

export async function readEditorLibrary(): Promise<EditorSnapshot> {
  if (activeStorage === 'browser') return readBrowserLibrary()
  try {
    const snapshot = editorSnapshotSchema.parse(await request('library'))
    activeStorage = 'project'
    return { ...snapshot, storage: 'project' }
  } catch (error) {
    if (!(error instanceof EditorApiUnavailableError)) throw error
    activeStorage = 'browser'
    return readBrowserLibrary()
  }
}

export async function saveEditorLibrary(library: PointLibrary, revision: string): Promise<EditorSnapshot> {
  if (activeStorage !== 'browser') {
    const snapshot = editorSnapshotSchema.parse(await request('library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ library, revision }) }))
    activeStorage = 'project'
    return { ...snapshot, storage: 'project' }
  }
  const snapshot = await saveBrowserPointLibrary(library, revision)
  return { ...snapshot, storage: 'browser' }
}

export async function readEditorVersions() {
  if (activeStorage === 'browser') return readBrowserPointVersions()
  return versionsSchema.parse(await request('versions'))
}

export async function readEditorVersion(revision: string) {
  if (activeStorage === 'browser') return readBrowserPointVersion(revision)
  return pointLibrarySchema.parse(await request(`versions/${encodeURIComponent(revision)}`))
}
