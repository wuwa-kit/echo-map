import { publishedDataArchiveSchema } from './published-data-png.ts'
import type { PublishedDataArchive } from './published-data-png.ts'

const databaseName = 'echo-map:published-data'
const storeName = 'archive'
const cacheKey = 'current'

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function cacheRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openCache()
  try {
    const transaction = database.transaction(storeName, mode)
    return await new Promise((resolve, reject) => {
      const request = run(transaction.objectStore(storeName))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error ?? request.error)
    })
  } finally {
    database.close()
  }
}

export async function readPublishedDataCache(url: string): Promise<PublishedDataArchive | undefined> {
  if (typeof indexedDB === 'undefined') return
  const entry = await cacheRequest<unknown>('readonly', store => store.get(cacheKey))
  if (entry === null || typeof entry !== 'object' || !('url' in entry) || entry.url !== url || !('archive' in entry)) return

  const archive = publishedDataArchiveSchema.safeParse(entry.archive)
  return archive.success ? archive.data : undefined
}

export async function writePublishedDataCache(url: string, archive: PublishedDataArchive): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await cacheRequest('readwrite', store => store.put({ url, archive }, cacheKey))
}
