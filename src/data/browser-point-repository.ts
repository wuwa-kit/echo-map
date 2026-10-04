import { z } from 'zod'
import { pointLibrarySchema, pointWorkspaceSchema } from '../domain/schema.ts'
import { editWorkspace, reviewLegacyLibrary, samePointLibrary, workspaceLibrary } from '../domain/local-points.ts'
import type { PointLibrary, PointWorkspace } from '../domain/types.ts'

export const editorSnapshotSchema = z.object({ library: pointLibrarySchema, revision: z.string() })
const workspaceSnapshotSchema = z.object({ workspace: pointWorkspaceSchema, revision: z.string() })
const versionSchema = z.object({ revision: z.string(), savedAt: z.string() })
type Snapshot = z.infer<typeof editorSnapshotSchema> & { workspace?: PointWorkspace }

function parseSnapshot(value: unknown): Snapshot {
  const stored = workspaceSnapshotSchema.safeParse(value)
  if (stored.success) return { ...stored.data, library: workspaceLibrary(stored.data.workspace) }
  return editorSnapshotSchema.parse(value)
}

const DATABASE_NAME = 'echo-map:point-editor'
const HISTORY_LIMIT = 50

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('浏览器点位数据读取失败'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器无法使用 IndexedDB，点位未保存'))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, 1)
    let blocked = false
    request.onupgradeneeded = () => {
      request.result.createObjectStore('library')
      request.result.createObjectStore('history')
      request.result.createObjectStore('versions', { autoIncrement: true })
    }
    request.onblocked = () => {
      blocked = true
      reject(new Error('浏览器点位数据库被其他页面占用，请关闭其他页面后重试'))
    }
    request.onerror = () => reject(request.error ?? new Error('浏览器点位数据库打开失败'))
    request.onsuccess = () => {
      const database = request.result
      if (blocked) { database.close(); return }
      database.onversionchange = () => database.close()
      resolve(database)
    }
  })
}

async function transaction<T>(stores: string[], mode: IDBTransactionMode, run: (transaction: IDBTransaction) => Promise<T>): Promise<T> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(stores, mode)
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error('浏览器点位保存已取消'))
    })
    // Only IndexedDB requests are awaited inside run; network loading stays outside the transaction.
    const work = run(transaction).catch((error: unknown) => {
      try { transaction.abort() } catch { /* A failed request may have already aborted the transaction. */ }
      throw error
    })
    const [result] = await Promise.all([work, completed])
    return result
  } finally {
    database.close()
  }
}

export function readBrowserPointSnapshot(): Promise<Snapshot | null> {
  return transaction(['library'], 'readonly', async (transaction) => {
    const stored = await requestResult<unknown>(transaction.objectStore('library').get('current'))
    return stored === undefined ? null : parseSnapshot(stored)
  })
}

export function initializeBrowserPointLibrary(library: PointLibrary): Promise<Snapshot> {
  const workspace: PointWorkspace = { version: 1, published: pointLibrarySchema.parse(library), changes: [] }
  const snapshot: Snapshot = { library: workspaceLibrary(workspace), workspace, revision: crypto.randomUUID() }
  return transaction(['library'], 'readwrite', async (transaction) => {
    const store = transaction.objectStore('library')
    const current = await requestResult<unknown>(store.get('current'))
    if (current !== undefined) return parseSnapshot(current)
    store.put({ workspace, revision: snapshot.revision }, 'current')
    return snapshot
  })
}

export function saveBrowserPointLibrary(library: PointLibrary, revision: string, replacement?: PointWorkspace): Promise<Snapshot> {
  return transaction(['library', 'history', 'versions'], 'readwrite', async (transaction) => {
    const store = transaction.objectStore('library')
    const stored = await requestResult<unknown>(store.get('current'))
    const current = stored === undefined ? null : parseSnapshot(stored)
    if (!current || current.revision !== revision) throw new Error('点位库已在其他页面更新，请刷新后核对记录再保存。')
    const workspace = pointWorkspaceSchema.parse(replacement ?? editWorkspace(current.workspace ?? reviewLegacyLibrary(current.library, current.library), pointLibrarySchema.parse(library)))
    const snapshot: Snapshot = { library: workspaceLibrary(workspace), workspace, revision: crypto.randomUUID() }
    const history = transaction.objectStore('history')
    const versions = transaction.objectStore('versions')
    history.put(stored, current.revision)
    versions.add({ revision: current.revision, savedAt: new Date().toISOString() })
    store.put({ workspace, revision: snapshot.revision }, 'current')
    const keys = await requestResult<IDBValidKey[]>(versions.getAllKeys())
    for (const key of keys.slice(0, Math.max(0, keys.length - HISTORY_LIMIT))) {
      const old = versionSchema.parse(await requestResult<unknown>(versions.get(key)))
      history.delete(old.revision)
      versions.delete(key)
    }
    return snapshot
  })
}

export async function synchronizeBrowserPoints(published: PointLibrary, current: Snapshot): Promise<Snapshot> {
  const workspace = current.workspace ? { ...current.workspace, published } : reviewLegacyLibrary(current.library, published)
  if (current.workspace && samePointLibrary(current.workspace.published, published)) return current
  return saveBrowserPointLibrary(workspaceLibrary(workspace), current.revision, workspace)
}

export function readBrowserPointVersions() {
  return transaction(['versions'], 'readonly', async (transaction) => {
    const stored = await requestResult<unknown[]>(transaction.objectStore('versions').getAll())
    return versionSchema.array().parse(stored).reverse()
  })
}

export function readBrowserPointVersion(revision: string): Promise<PointLibrary> {
  return transaction(['history'], 'readonly', async (transaction) => {
    const stored = await requestResult<unknown>(transaction.objectStore('history').get(revision))
    if (stored === undefined) throw new Error('找不到这个浏览器历史版本')
    const snapshot = editorSnapshotSchema.safeParse(stored)
    if (snapshot.success) return snapshot.data.library
    const workspace = workspaceSnapshotSchema.safeParse(stored)
    return workspace.success ? workspaceLibrary(workspace.data.workspace) : pointLibrarySchema.parse(stored)
  })
}
