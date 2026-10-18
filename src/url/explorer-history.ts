import { z } from 'zod'
import type { NavigationGuardReturn, RouteLocationNormalized } from 'vue-router'
import { explorerQueryKeys, pickExplorerQuery } from './explorer-session.ts'
import type { ExplorerSessionQuery } from './explorer-session.ts'

const STORAGE_KEY = 'echo-map:last-explorer-query'
const storedQuerySchema = z.record(z.string(), z.string())

export function readLastExplorerQuery(): ExplorerSessionQuery | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const parsed = storedQuerySchema.safeParse(JSON.parse(stored))
    return parsed.success ? pickExplorerQuery(parsed.data) : null
  } catch {
    return null
  }
}

export function saveLastExplorerQuery(query: ExplorerSessionQuery): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(query))
  } catch {
    // The in-memory session remains usable when browser storage is unavailable.
  }
}

export function createExplorerEntryGuard(session: {
  initialize: () => void
  importQuery: (query: ExplorerSessionQuery) => void
}): (to: RouteLocationNormalized) => NavigationGuardReturn {
  return (to) => {
    if (to.path !== '/') return
    session.initialize()
    if (Object.keys(to.query).length === 0 && !to.hash) return
    if (to.query.share === '1' || explorerQueryKeys.some(key => Object.hasOwn(to.query, key))) {
      session.importQuery(pickExplorerQuery(to.query))
    }
    return { path: '/', query: {}, hash: '', replace: true }
  }
}
