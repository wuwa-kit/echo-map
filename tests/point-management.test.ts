import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePointEditorStore } from '../src/stores/point-editor.ts'
import { usePointManagementStore } from '../src/stores/point-management.ts'
import { readEditorLibrary, saveEditorLibrary } from '../src/data/editor-client.ts'
import { loadMapDataset } from '../src/data/load.ts'
import { editWorkspace, workspaceLibrary } from '../src/domain/local-points.ts'
import { pointTransferSchema } from '../src/domain/schema.ts'
import type { AuthoredNavigationPoint, PointWorkspace } from '../src/domain/types.ts'
import { mixedPoint, referenceDataset } from './fixtures/point-library.ts'
import { navigationTypeIcons } from '../src/domain/navigation-icons.ts'

vi.mock('../src/data/editor-client.ts')
vi.mock('../src/data/load.ts')
let stored: PointWorkspace
let revision = 0
function navigation(id: string): AuthoredNavigationPoint {
  return { id, kind: 'navigation', stateId: 8, levelId: null, gravityType: null, coordinate: { x: -497, y: 449, z: 18 }, name: '小型信标', navigationKind: 'beacon', pointType: 'small-beacon', mode: 'fast-travel', iconId: navigationTypeIcons('small-beacon')[0]?.id }
}
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  revision = 0
  stored = { version: 1, published: { version: 1, points: [navigation('published')] }, changes: [] }
  vi.mocked(loadMapDataset).mockResolvedValue({ dataset: referenceDataset, officialLibrary: { version: 1, points: [] } })
  vi.mocked(readEditorLibrary).mockImplementation(async () => ({ library: workspaceLibrary(stored), workspace: stored, revision: String(revision), storage: 'browser' }))
  vi.mocked(saveEditorLibrary).mockImplementation(async (library, expected, _previous, _replace, workspace) => {
    if (expected !== String(revision)) throw new Error('revision conflict')
    stored = workspace ?? editWorkspace(stored, library)
    revision += 1
    return { library: workspaceLibrary(stored), workspace: stored, revision: String(revision), storage: 'browser' }
  })
})

describe('point management actions', () => {
  it('shows no browser management rows until a local edit exists and removes a row when it is reverted', async () => {
    const store = usePointEditorStore()
    await store.load()
    expect(store.managedPoints).toEqual([])
    expect(store.library.points.map(point => point.id)).toEqual(['published'])
    store.selectPoint('published')
    store.setNote('本地修改')
    expect(await store.savePoint()).toBe(true)
    expect(store.managedPoints).toHaveLength(1)
    expect(store.managedPoints[0]).toMatchObject({ id: 'published', operation: 'modified', status: 'pending' })
    expect(await store.managePoints(['published'], 'published')).toBe(true)
    expect(store.managedPoints).toEqual([])
    expect(store.library.points.map(point => point.id)).toEqual(['published'])
  })

  it('continues listing and exporting project files when using the project editor', async () => {
    const library = { version: 1 as const, points: [navigation('project')] }
    vi.mocked(readEditorLibrary).mockResolvedValue({ library, revision: {}, storage: 'project' })
    const store = usePointEditorStore()
    await store.load()
    expect(store.managedPoints.map(row => row.id)).toEqual(['project'])
    expect(store.managedPoints[0]?.operation).toBeNull()
    expect(store.createPointExport('navigation')?.data).toEqual(library)
  })

  it('exports only selected changes of the requested kind, with full workspace available as a separate backup', async () => {
    stored = editWorkspace(stored, { version: 1, points: [...stored.published.points, navigation('a'), navigation('b'), mixedPoint()] })
    const store = usePointEditorStore()
    await store.load()
    const file = store.createPointExport('navigation', ['a', 'mixed-point'])
    const data = pointTransferSchema.parse(file?.data)
    expect(data.format).toBe('point-changes')
    if (data.format !== 'point-changes') throw new Error('Expected contribution')
    expect(data.changes.map(change => change.id)).toEqual(['a'])
    const backup = pointTransferSchema.parse(store.createPointExport('navigation', undefined, true)?.data)
    expect(backup.format).toBe('point-backup')
    if (backup.format !== 'point-backup') throw new Error('Expected backup')
    expect(backup.workspace).toEqual(stored)
  })

  it('blocks conflicting submissions, keeps backups available, and resolves against the current website version', async () => {
    const original = navigation('published')
    stored = editWorkspace(stored, { version: 1, points: [{ ...original, note: 'local' }] })
    stored = { ...stored, published: { version: 1, points: [{ ...original, note: 'website' }] } }
    const store = usePointEditorStore()
    await store.load()
    expect(store.createPointExport('navigation')).toBeNull()
    expect(store.createPointExport('navigation', undefined, true)).not.toBeNull()
    expect(await store.managePoints(['published'], 'local')).toBe(true)
    expect(store.managedPoints[0]).toMatchObject({ operation: 'modified', status: 'pending' })
    expect(store.workspace?.changes[0]?.before?.note).toBe('website')
    expect(store.createPointExport('navigation')).not.toBeNull()
  })

  it('prevents bulk operations when either form has unsaved edits', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    store.setNote('hidden unsaved edit')
    store.switchEditorTab('navigation')
    expect(await store.managePoints(['published'], 'delete')).toBe(false)
    expect(await store.refreshPublishedPoints()).toBe(false)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
  })

  it('deletes selected points only and can undo a local deletion using the website version', async () => {
    const store = usePointEditorStore()
    await store.load()
    expect(await store.managePoints(['published'], 'delete')).toBe(true)
    expect(store.library.points).toEqual([])
    expect(store.managedPoints[0]).toMatchObject({ operation: 'deleted', status: 'pending' })
    expect(await store.managePoints(['published'], 'published')).toBe(true)
    expect(store.library.points.map(point => point.id)).toEqual(['published'])
  })

  it('refreshes website data and clears saved forms that would otherwise retain obsolete values', async () => {
    const store = usePointEditorStore()
    await store.load()
    store.selectPoint('published')
    stored = { ...stored, published: { version: 1, points: [{ ...navigation('published'), note: 'new website version' }] } }
    expect(await store.refreshPublishedPoints()).toBe(true)
    expect(store.library.points[0]?.note).toBe('new website version')
    expect(store.draft?.id).not.toBe('published')
    expect(store.hasUnsavedChanges).toBe(false)
  })

  it('imports contributions without replacing unrelated records and keeps existing local baselines', async () => {
    const original = navigation('published')
    const local = { ...original, note: 'local' }
    stored = editWorkspace(stored, { version: 1, points: [local] })
    const store = usePointEditorStore()
    await store.load()
    store.previewImport(JSON.stringify({ format: 'point-changes', version: 1, exportedAt: new Date().toISOString(), changes: [
      { id: original.id, before: local, after: { ...local, note: 'incoming' }, needsReview: false },
      { id: 'new', before: null, after: navigation('new'), needsReview: false },
    ] }))
    expect(store.error).toBe('')
    await store.applyImport()
    expect(store.library.points.map(point => point.id)).toEqual(['published', 'new'])
    expect(store.workspace?.changes.find(change => change.id === original.id)?.before).toEqual(original)
    expect(store.library.points[0]?.note).toBe('incoming')
    expect(vi.mocked(saveEditorLibrary).mock.calls[0]?.[3]).toBe(false)
  })

  it('rejects an entire contribution when a record changed since export', async () => {
    const store = usePointEditorStore()
    await store.load()
    store.previewImport(JSON.stringify({ format: 'point-changes', version: 1, exportedAt: new Date().toISOString(), changes: [
      { id: 'new', before: null, after: navigation('new'), needsReview: false },
      { id: 'published', before: { ...navigation('published'), note: 'obsolete' }, after: null, needsReview: false },
    ] }))
    expect(store.importPreview).toBeNull()
    expect(store.error).toContain('冲突')
    expect(saveEditorLibrary).not.toHaveBeenCalled()
  })

  it('restores a backup against current website data without dropping newly published points', async () => {
    const backup = editWorkspace(stored, { version: 1, points: [...stored.published.points, navigation('local')] })
    stored = { ...stored, published: { version: 1, points: [...stored.published.points, navigation('new-published')] } }
    const store = usePointEditorStore()
    await store.load()
    store.previewImport(JSON.stringify({ format: 'point-backup', version: 1, exportedAt: new Date().toISOString(), workspace: backup }))
    await store.applyImport()
    expect(store.library.points.map(point => point.id)).toEqual(['published', 'new-published', 'local'])
    expect(store.draft).not.toBeNull()
  })

  it('keeps selection changes explicit and clears them when the search scope changes', () => {
    const manager = usePointManagementStore()
    manager.selectMany(['a', 'b'], true)
    manager.toggle('a', false)
    expect(manager.selected).toEqual(['b'])
    manager.requestAction('delete', ['b'])
    manager.setSearch('信标')
    expect(manager.selected).toEqual([])
    expect(manager.pending).toBeNull()
  })
})
