import { describe, expect, it } from 'vitest'
import { changeStatus, editWorkspace, managementRows, parsePointWorkspace, pointExportFilename, resolveWorkspace, reviewLegacyLibrary, samePoint, workspaceLibrary } from '../src/domain/local-points.ts'
import { pointTransferSchema, pointWorkspaceSchema } from '../src/domain/schema.ts'
import { serializeJson } from '../src/utils/json.ts'
import type { AuthoredPoint, PointLibrary, PointWorkspace } from '../src/domain/types.ts'
import { mixedPoint, referenceDataset } from './fixtures/point-library.ts'

const library = (...points: AuthoredPoint[]): PointLibrary => ({ version: 1, points })
const workspace = (...points: AuthoredPoint[]): PointWorkspace => ({ version: 1, published: library(...points), changes: [] })

describe('local point synchronization', () => {
  it('preserves local edits while adopting unrelated website updates', () => {
    const original = mixedPoint()
    const local = { ...original, note: '本地修改' }
    const edited = editWorkspace(workspace(original), library(local))
    const updated = { ...edited, published: library(original, mixedPoint('new-published')) }
    expect(workspaceLibrary(updated).points).toEqual([local, mixedPoint('new-published')])
    expect(managementRows(updated).find(row => row.id === original.id)?.status).toBe('modified')
    expect(edited.changes[0]?.before).toEqual(original)
  })

  it('marks identical published submissions adopted and cleans only the selected local record', () => {
    const a = mixedPoint('a')
    const b = mixedPoint('b')
    const local = editWorkspace(workspace(), library(a, b))
    const updated = { ...local, published: library(a, b) }
    expect(managementRows(updated).map(row => row.status)).toEqual(['adopted', 'adopted'])
    const cleaned = resolveWorkspace(updated, ['a'], 'cleanup')
    expect(cleaned.changes.map(change => change.id)).toEqual(['b'])
    expect(workspaceLibrary(cleaned)).toEqual(library(a, b))
  })

  it('retains the original baseline across conflicting website updates and supports explicit resolution', () => {
    const original = mixedPoint()
    const local = { ...original, note: '我修改了' }
    const remote = { ...original, note: '网站也修改了' }
    const changed = editWorkspace(workspace(original), library(local))
    const updated = { ...changed, published: library(remote) }
    expect(managementRows(updated)[0]?.status).toBe('conflict')
    const editedAgain = editWorkspace(updated, library({ ...local, note: '再次修改' }))
    expect(editedAgain.changes[0]?.before).toEqual(original)
    expect(managementRows(editedAgain)[0]?.status).toBe('conflict')
    const keepLocal = resolveWorkspace(updated, [original.id], 'local')
    expect(keepLocal.changes[0]?.before).toEqual(remote)
    expect(managementRows(keepLocal)[0]?.status).toBe('modified')
    const keepWebsite = resolveWorkspace(updated, [original.id], 'published')
    expect(keepWebsite.changes).toEqual([])
    expect(workspaceLibrary(keepWebsite)).toEqual(library(remote))
  })

  it('tracks deletion, distinguishes website edits from adoption, and can restore a deleted point', () => {
    const original = mixedPoint()
    const deleted = editWorkspace(workspace(original), library())
    expect(managementRows(deleted)[0]?.status).toBe('deleted')
    expect(workspaceLibrary(deleted).points).toEqual([])
    expect(managementRows({ ...deleted, published: library({ ...original, note: '更新' }) })[0]?.status).toBe('conflict')
    expect(managementRows({ ...deleted, published: library() })[0]?.status).toBe('adopted')
    expect(workspaceLibrary(resolveWorkspace(deleted, [original.id], 'published'))).toEqual(library(original))
  })

  it('removes canceled new points and canceled modifications without leaving empty change records', () => {
    const point = mixedPoint()
    const added = editWorkspace(workspace(), library(point))
    expect(editWorkspace(added, library()).changes).toEqual([])
    const modified = editWorkspace(workspace(point), library({ ...point, note: '编辑' }))
    expect(editWorkspace(modified, library(point)).changes).toEqual([])
    const conflicted = { ...modified, published: library({ ...point, note: '网站修改' }) }
    expect(workspaceLibrary(editWorkspace(conflicted, library(point)))).toEqual(library(point))
    expect(managementRows(editWorkspace(conflicted, library(point)))[0]?.status).toBe('conflict')
    const legacy = reviewLegacyLibrary(library(point), library())
    expect(editWorkspace(legacy, library()).changes).toEqual([])
  })

  it('preserves legacy differences for review without guessing that new published points were deleted', () => {
    const point = mixedPoint()
    const local = { ...point, note: '来源未知的旧编辑' }
    const reviewed = reviewLegacyLibrary(library(local), library(point, mixedPoint('new')))
    expect(reviewed.changes).toHaveLength(1)
    expect(managementRows(reviewed)[0]?.status).toBe('review')
    expect(workspaceLibrary(reviewed).points).toEqual([local, mixedPoint('new')])
    expect(managementRows(resolveWorkspace(reviewed, [point.id], 'local'))[0]?.status).toBe('modified')
  })

  it('only suggests nearby duplicates of a compatible type, floor, gravity and height', () => {
    const point = mixedPoint('local')
    const candidate = mixedPoint('published')
    const otherFloor = { ...mixedPoint('other-floor'), levelId: 'different' }
    const otherGravity = { ...mixedPoint('other-gravity'), gravityType: 2 as const }
    const otherHeight = { ...mixedPoint('other-height'), coordinate: { ...point.coordinate, z: 100 } }
    const baseline = workspace(candidate, otherFloor, otherGravity, otherHeight)
    const local = editWorkspace(baseline, library(...baseline.published.points, point))
    expect(managementRows(local).find(row => row.id === point.id)?.duplicateIds).toEqual(['published'])
    expect(workspaceLibrary(local).points).toHaveLength(5)
  })

  it('compares object contents independently of JSON property order', () => {
    const point = mixedPoint()
    const reversed = Object.fromEntries(Object.entries(point).reverse())
    const parsed = pointWorkspaceSchema.parse({ ...workspace(), changes: [{ id: point.id, before: null, after: reversed, needsReview: false }] })
    const change = parsed.changes[0]
    if (!change) throw new Error('Expected change')
    expect(samePoint(point, change.after)).toBe(true)
    expect(changeStatus(change, point)).toBe('adopted')
  })

  it('round-trips deletion and addition transfers and rejects malformed identity or unknown references', () => {
    const point = mixedPoint()
    const changes = editWorkspace(workspace(point), library(mixedPoint('new'))).changes
    const transfer = { format: 'point-changes', version: 1, exportedAt: new Date().toISOString(), changes }
    const parsed = pointTransferSchema.parse(JSON.parse(serializeJson(transfer)))
    if (parsed.format !== 'point-changes') throw new Error('Expected contribution')
    expect(parsed.changes).toEqual(changes)
    expect(pointWorkspaceSchema.safeParse({ ...workspace(), changes: [{ id: 'other', before: null, after: point, needsReview: false }] }).success).toBe(false)
    expect(() => parsePointWorkspace(workspace({ ...point, stateId: -99 }), referenceDataset)).toThrow('未知地图')
  })

  it('uses local calendar fields and filesystem-safe sortable export names', () => {
    expect(pointExportFilename('定位点修改', new Date(2026, 9, 4, 8, 5, 9))).toBe('声巡-定位点修改-20261004-080509.json')
  })
})
