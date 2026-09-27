import { z } from 'zod'
import { combinePointLibraryKinds } from '../domain/point-library.ts'
import { echoPointLibrarySchema, navigationPointLibrarySchema, pointLibrarySchema } from '../domain/schema.ts'
import type { PointLibrary } from '../domain/types.ts'

const snapshotSchema = z.object({ library: pointLibrarySchema, revision: z.string() })
const versionsSchema = z.array(z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/u), savedAt: z.string() }))
const browserHistorySchema = z.array(z.object({
  library: pointLibrarySchema,
  revision: z.string(),
  savedAt: z.string(),
}))
const browserLibraryKey = 'echo-map:point-editor:library:v1'
const browserHistoryKey = 'echo-map:point-editor:history:v1'
type EditorStorage = 'project' | 'browser'
type EditorSnapshot = z.infer<typeof snapshotSchema> & { storage: EditorStorage }
let activeStorage: EditorStorage | null = null
let memorySnapshot: z.infer<typeof snapshotSchema> | null = null

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

function storedBrowserSnapshot(): z.infer<typeof snapshotSchema> | null {
  const stored = localStorage.getItem(browserLibraryKey)
  return stored ? snapshotSchema.parse(JSON.parse(stored)) : null
}

function browserHistory(): z.infer<typeof browserHistorySchema> {
  const stored = localStorage.getItem(browserHistoryKey)
  return stored ? browserHistorySchema.parse(JSON.parse(stored)) : []
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
  const stored = storedBrowserSnapshot()
  if (stored) {
    memorySnapshot = stored
    return { ...stored, storage: 'browser' }
  }
  const snapshot = { library: await publishedLibrary(), revision: crypto.randomUUID() }
  localStorage.setItem(browserLibraryKey, JSON.stringify(snapshot))
  memorySnapshot = snapshot
  return { ...snapshot, storage: 'browser' }
}

export async function readEditorLibrary(): Promise<EditorSnapshot> {
  if (activeStorage === 'browser') return readBrowserLibrary()
  try {
    const snapshot = snapshotSchema.parse(await request('library'))
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
    const snapshot = snapshotSchema.parse(await request('library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ library, revision }) }))
    activeStorage = 'project'
    return { ...snapshot, storage: 'project' }
  }
  const current = storedBrowserSnapshot() ?? memorySnapshot
  if (!current || current.revision !== revision) throw new Error('点位库已在其他页面更新，请刷新后核对记录再保存。')
  const history = [{ ...current, savedAt: new Date().toISOString() }, ...browserHistory()].slice(0, 50)
  const snapshot = { library: pointLibrarySchema.parse(library), revision: crypto.randomUUID() }
  localStorage.setItem(browserHistoryKey, JSON.stringify(history))
  localStorage.setItem(browserLibraryKey, JSON.stringify(snapshot))
  memorySnapshot = snapshot
  return { ...snapshot, storage: 'browser' }
}

export async function readEditorVersions() {
  if (activeStorage === 'browser') return browserHistory().map(({ revision, savedAt }) => ({ revision, savedAt }))
  return versionsSchema.parse(await request('versions'))
}

export async function readEditorVersion(revision: string) {
  if (activeStorage === 'browser') {
    const version = browserHistory().find((candidate) => candidate.revision === revision)
    if (!version) throw new Error('找不到这个浏览器历史版本')
    return version.library
  }
  return pointLibrarySchema.parse(await request(`versions/${encodeURIComponent(revision)}`))
}
