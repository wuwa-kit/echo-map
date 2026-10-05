import { produce } from 'immer'
import type { AuthoredPoint, LocalPointChange, LocalPointOperation, LocalPointStatus, PointLibrary, PointManagementRow, PointWorkspace } from './types.ts'
import type { MapDataset } from './types.ts'
import { pointWorkspaceSchema } from './schema.ts'
import { parsePointLibrary } from './point-library.ts'
import { findPointDuplicates } from './point-matching.ts'

export function parsePointWorkspace(value: unknown, dataset: MapDataset): PointWorkspace {
  const workspace = pointWorkspaceSchema.parse(value)
  parsePointLibrary(workspace.published, dataset, 'manual')
  for (const change of workspace.changes) for (const point of [change.before, change.after]) {
    if (point) parsePointLibrary({ version: 1, points: [point] }, dataset, 'manual')
  }
  parsePointLibrary(workspaceLibrary(workspace), dataset, 'manual')
  return workspace
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value) ?? ''
}

export function samePoint(left: AuthoredPoint | null, right: AuthoredPoint | null): boolean {
  return canonical(left) === canonical(right)
}

export function samePointLibrary(left: PointLibrary, right: PointLibrary): boolean {
  if (left.points.length !== right.points.length) return false
  const points = new Map(right.points.map(point => [point.id, point]))
  return left.points.every(point => samePoint(point, points.get(point.id) ?? null))
}

export function workspaceLibrary(workspace: PointWorkspace): PointLibrary {
  const points = new Map(workspace.published.points.map(point => [point.id, point]))
  for (const change of workspace.changes) {
    if (change.after) points.set(change.id, change.after)
    else points.delete(change.id)
  }
  return { version: 1, points: [...points.values()] }
}

export function changeStatus(change: LocalPointChange, published: AuthoredPoint | null): LocalPointStatus {
  if (change.needsReview) return 'review'
  if (samePoint(change.after, published)) return 'adopted'
  if (!samePoint(change.before, published)) return 'conflict'
  return 'pending'
}

export function changeOperation(change: LocalPointChange): LocalPointOperation {
  return !change.after ? 'deleted' : change.before ? 'modified' : 'added'
}

// Old full snapshots have no trustworthy baseline. Keep every difference for review.
export function reviewLegacyLibrary(library: PointLibrary, published: PointLibrary): PointWorkspace {
  const original = new Map(published.points.map(point => [point.id, point]))
  return {
    version: 1, published,
    changes: library.points.filter(point => !samePoint(point, original.get(point.id) ?? null)).map(point => ({
      id: point.id, before: original.get(point.id) ?? null, after: point, needsReview: true,
    })),
  }
}

export function editWorkspace(workspace: PointWorkspace, library: PointLibrary): PointWorkspace {
  const previous = new Map(workspaceLibrary(workspace).points.map(point => [point.id, point]))
  const next = new Map(library.points.map(point => [point.id, point]))
  const published = new Map(workspace.published.points.map(point => [point.id, point]))
  const changes = new Map(workspace.changes.map(change => [change.id, change]))
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    const after = next.get(id) ?? null
    if (samePoint(previous.get(id) ?? null, after)) continue
    const existing = changes.get(id)
    const original = published.get(id) ?? null
    let before = existing && changeStatus(existing, original) !== 'adopted' ? existing.before : original
    if (!before && !after) before = original
    if ((!before && !after) || (samePoint(before, after) && samePoint(before, original) && !existing?.needsReview)) changes.delete(id)
    else changes.set(id, { id, before, after, needsReview: existing?.needsReview ?? false })
  }
  return { ...workspace, changes: [...changes.values()] }
}

export function resolveWorkspace(workspace: PointWorkspace, ids: readonly string[], resolution: 'published' | 'local' | 'cleanup'): PointWorkspace {
  const selected = new Set(ids)
  const published = new Map(workspace.published.points.map(point => [point.id, point]))
  return produce(workspace, draft => {
    draft.changes = draft.changes.flatMap(change => {
      if (!selected.has(change.id)) return [change]
      const current = published.get(change.id) ?? null
      if (resolution === 'cleanup') return changeStatus(change, current) === 'adopted' ? [] : [change]
      if (resolution === 'published' || samePoint(change.after, current)) return []
      return [{ ...change, before: current, needsReview: false }]
    })
  })
}

function pointCell(point: AuthoredPoint, dx = 0, dy = 0): string {
  return `${point.stateId}/${point.gravityType ?? null}/${Math.floor((point.coordinate.x ?? 0) / 30) + dx}/${Math.floor((point.coordinate.y ?? 0) / 30) + dy}`
}

export function managementRows(workspace: PointWorkspace): PointManagementRow[] {
  const published = new Map(workspace.published.points.map(point => [point.id, point]))
  const cells = new Map<string, AuthoredPoint[]>()
  for (const point of published.values()) {
    const key = pointCell(point)
    const cell = cells.get(key) ?? []
    cell.push(point)
    cells.set(key, cell)
  }
  return workspace.changes.flatMap(change => {
    const id = change.id
    const current = published.get(id) ?? null
    const point = change.after ?? change.before
    if (!point) return []
    const duplicateIds: string[] = []
    if (change.after && !current) {
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
        for (const candidate of cells.get(pointCell(point, dx, dy)) ?? []) {
          if (findPointDuplicates([candidate], point).some(({ suspicious }) => suspicious)) duplicateIds.push(candidate.id)
        }
      }
    }
    return [{ id, point, before: change.before, local: change.after, published: current, operation: changeOperation(change), status: changeStatus(change, current), duplicateIds }]
  })
}

export function projectManagementRows(library: PointLibrary): PointManagementRow[] {
  return library.points.map(point => ({ id: point.id, point, before: point, local: point, published: point, operation: null, status: 'published', duplicateIds: [] }))
}

export function pointExportFilename(title: string, date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `声巡-${title}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`
}
