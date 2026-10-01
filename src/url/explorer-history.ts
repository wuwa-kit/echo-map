import { z } from 'zod'
import type { NavigationGuard } from 'vue-router'
import type { ExplorerSerializedQueryValues } from './explorer-url.ts'

const STORAGE_KEY = 'echo-map:last-explorer-query'
const queryKeys = [
  'sources', 'map', 'region', 'floor', 'floorStyle', 'gravity', 'echoes',
  'sonatas', 'costs', 'provisional', 'panel', 'sheet', 'x', 'y', 'zoom',
] as const satisfies readonly (keyof ExplorerSerializedQueryValues)[]
const storedQuerySchema = z.record(z.string(), z.string())

export function readLastExplorerQuery(): ExplorerSerializedQueryValues | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const parsed = storedQuerySchema.safeParse(JSON.parse(stored))
    if (!parsed.success) return null
    const query: ExplorerSerializedQueryValues = {}
    for (const key of queryKeys) {
      const value = parsed.data[key]
      if (value?.trim()) query[key] = value
    }
    return query
  } catch {
    // Storage may be unavailable or contain invalid JSON.
    return null
  }
}

export function saveLastExplorerQuery(query: ExplorerSerializedQueryValues): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(query))
  } catch {
    // URL state remains usable when browser storage is unavailable.
  }
}

export const restoreLastExplorerQuery: NavigationGuard = (to, from, next) => {
  // Query updates within the explorer must never restore an older snapshot.
  if (to.path === '/' && from.name !== 'explorer' && Object.keys(to.query).length === 0) {
    const query = readLastExplorerQuery()
    if (query && Object.keys(query).length > 0) {
      next({ path: to.path, query, hash: to.hash, replace: true })
      return
    }
  }
  next()
}
