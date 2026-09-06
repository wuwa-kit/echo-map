import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePointEditorStore } from '../src/stores/point-editor.ts'
import { loadMapDataset, loadOfficialPointLibrary } from '../src/data/load.ts'
import { readEditorLibrary, readEditorVersions, saveEditorLibrary } from '../src/data/editor-client.ts'
import { referenceDataset, mixedPoint, smallEcho, eliteEcho } from './fixtures/point-library.ts'
import type { PointLibrary } from '../src/domain/types.ts'

vi.mock('../src/data/load.ts')
vi.mock('../src/data/editor-client.ts')
let disk: PointLibrary
let revision: number
const cache = new Map<string, string>()

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  cache.clear()
  vi.stubGlobal('localStorage', { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => cache.set(key, value), removeItem: (key: string) => cache.delete(key) })
  disk = { version: 1, points: [] }
  revision = 1
  vi.mocked(loadMapDataset).mockResolvedValue(referenceDataset)
  vi.mocked(loadOfficialPointLibrary).mockResolvedValue({ version: 1, points: [] })
  vi.mocked(readEditorLibrary).mockImplementation(async () => ({ library: disk, revision: String(revision) }))
  vi.mocked(readEditorVersions).mockResolvedValue([])
  vi.mocked(saveEditorLibrary).mockImplementation(async (library) => {
    disk = library
    revision += 1
    return { library, revision: String(revision) }
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('point editor actions', () => {
  it('records gravity for new observations, keeps XYZ, and resets it when changing maps', async () => {
    const store = usePointEditorStore()
    await store.load()
    store.selectState(903)
    expect(store.draft?.gravityType).toBeNull()
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    store.addMember(smallEcho.id)
    store.selectGravity(2)
    expect(store.draft?.coordinate).toEqual({ x: 100, y: 200, z: 30 })
    expect(store.draft?.gravityType).toBe(2)
    await store.saveDraft('verified', true)
    expect(disk.points[0]?.gravityType).toBe(2)
    expect(store.draft?.gravityType).toBe(2)
    store.selectState(8)
    expect(store.draft?.gravityType).toBeNull()
    store.selectGravity(2)
    expect(store.draft?.gravityType).toBeNull()
  })
  it('requires a nearby decision, appends a partial observation, and retains the tracking target', async () => {
    disk = { version: 1, points: [{ ...mixedPoint(), members: [{ echoId: smallEcho.id, count: 3 }] }] }
    const store = usePointEditorStore()
    await store.load()
    store.setTrackingEcho(eliteEcho.id)
    store.setCoordinateText('-495, 449, 20')
    store.applyCoordinateText()
    expect(store.nearbyPoints[0]?.point.id).toBe('mixed-point')
    await store.saveDraft('verified')
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    store.appendToNearby('mixed-point')
    expect(store.draft?.coordinate).toEqual({ x: -497, y: 449, z: 18 })
    await store.saveDraft('verified', true)
    expect(disk.points).toHaveLength(1)
    expect(disk.points[0]?.kind === 'echo' ? disk.points[0].members : []).toEqual([{ echoId: smallEcho.id, count: 3 }, { echoId: eliteEcho.id, count: 1 }])
    expect(disk.points[0]?.kind === 'echo' ? disk.points[0].compositionStatus : '').toBe('partial')
    expect(store.draft?.kind === 'echo' ? store.draft.members : []).toEqual([{ echoId: eliteEcho.id, count: 1 }])
    expect(store.draft?.coordinate).toEqual({ x: null, y: null, z: null })
    store.setTrackingEcho(smallEcho.id)
    expect(store.draft?.kind === 'echo' ? store.draft.members : []).toEqual([{ echoId: smallEcho.id, count: 1 }])
    expect(store.dirty).toBe(false)
  })

  it('promotes an official candidate into the manual file at observed XYZ and replaces its display', async () => {
    const official = { ...mixedPoint('official:one'), status: 'imported' as const, officialIds: ['one'], coordinate: { x: -497, y: 449, z: 0 } }
    vi.mocked(loadOfficialPointLibrary).mockResolvedValue({ version: 1, points: [official] })
    const store = usePointEditorStore()
    await store.load()
    store.setTrackingEcho(smallEcho.id)
    store.setCoordinateText('-496, 450, 120')
    store.applyCoordinateText()
    expect(store.nearbyPoints[0]?.heightDifference).toBeNull()
    store.appendToNearby('official:one')
    await store.saveDraft('verified')
    expect(disk.points).toHaveLength(1)
    expect(disk.points[0]?.coordinate).toEqual({ x: -496, y: 450, z: 120 })
    expect(disk.points[0]?.replacesOfficialIds).toEqual(['official:one'])
    expect(store.allPoints).toHaveLength(1)
    expect(store.officialLibrary.points[0]).toEqual(official)
    store.setOfficialVisible(false)
    expect(store.allPoints).toEqual(disk.points)
  })

  it('allows an explicit separate point but asks again after moving its coordinates', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load()
    store.setTrackingEcho(smallEcho.id)
    store.setCoordinateText('-496, 449, 18')
    store.applyCoordinateText()
    store.confirmSeparatePoint()
    expect(store.requiresMatchDecision).toBe(false)
    store.setCoordinate('x', '-495')
    expect(store.requiresMatchDecision).toBe(true)
    store.confirmSeparatePoint()
    await store.saveDraft('verified')
    expect(disk.points).toHaveLength(2)
  })

  it('saves full mixed groups, continues with a blank position, and preserves scope', async () => {
    const store = usePointEditorStore()
    await store.load()
    expect(store.draft?.stateId).toBe(8)
    store.setCoordinateText('-497, 449, 18')
    store.applyCoordinateText()
    store.addMember(smallEcho.id)
    store.addMember(smallEcho.id)
    expect(store.draft?.kind === 'echo' ? store.draft.members : []).toEqual([{ echoId: smallEcho.id, count: 2 }])
    await store.saveDraft('verified', true)
    expect(disk.points[0]?.status).toBe('verified')
    expect(store.draft?.coordinate).toEqual({ x: null, y: null, z: null })
    expect(store.draft?.stateId).toBe(8)
    expect(store.dirty).toBe(false)
    expect(cache.size).toBe(0)
  })

  it('retains edits after failed saves and supports explicit draft recovery after reopening', async () => {
    const first = usePointEditorStore()
    await first.load()
    first.addMember(smallEcho.id)
    first.setNote('尚未保存的现场记录')
    vi.mocked(saveEditorLibrary).mockRejectedValueOnce(new Error('文件写入失败'))
    await first.saveDraft('draft')
    expect(first.dirty).toBe(true)
    expect(first.error).toBe('文件写入失败')
    expect(disk.points).toEqual([])
    setActivePinia(createPinia())
    const second = usePointEditorStore()
    await second.load()
    expect(second.recovery?.note).toBe('尚未保存的现场记录')
    second.recoverDraft()
    expect(second.draft?.note).toBe('尚未保存的现场记录')
    expect(second.dirty).toBe(true)
  })

  it('does not silently replace invalid input with the previously saved value', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load()
    store.selectPoint('mixed-point')
    store.setMemberCount(smallEcho.id, 0)
    expect(store.dirty).toBe(true)
    store.newPoint()
    expect(store.draft?.id).toBe('mixed-point')
    await store.saveDraft('verified')
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    store.setMemberCount(smallEcho.id, 8)
    store.setCoordinate('z', '1.5')
    await store.saveDraft('verified')
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    store.setCoordinate('z', '0')
    await store.saveDraft('verified')
    expect(disk.points[0]?.coordinate.z).toBe(0)
    expect(disk.points[0]?.kind === 'echo' ? disk.points[0].members[0]?.count : 0).toBe(8)
    store.newPoint()
    store.setCoordinate('x', 'invalid')
    store.discardChanges()
    expect(store.dirty).toBe(false)
  })

  it('copies compositions with a new ID and cleared XYZ, and protects unsaved edits', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load()
    store.selectPoint('mixed-point')
    store.copyPoint()
    expect(store.draft?.id).not.toBe('mixed-point')
    expect(store.draft?.coordinate).toEqual({ x: null, y: null, z: null })
    expect(store.draft?.kind === 'echo' ? store.draft.members : []).toEqual(mixedPoint().members)
    const copyId = store.draft?.id
    store.selectPoint('mixed-point')
    expect(store.draft?.id).toBe(copyId)
    expect(store.error).toContain('先保存')
    store.discardChanges()
    store.selectPoint('mixed-point')
    expect(store.draft?.id).toBe('mixed-point')
  })

  it('persists delete and undo operations', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load()
    store.selectPoint('mixed-point')
    await store.deletePoint()
    expect(disk.points).toEqual([])
    await store.undoDelete()
    expect(disk.points).toEqual([mixedPoint()])
    expect(store.deleted).toBeNull()
  })

  it('previews imports without writing until applied and rejects foreign references', async () => {
    const store = usePointEditorStore()
    await store.load()
    store.previewImport(JSON.stringify({ version: 1, points: [mixedPoint()] }))
    expect(store.importPreview?.points).toHaveLength(1)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    await store.applyImport()
    expect(disk.points).toHaveLength(1)
    store.previewImport(JSON.stringify({ version: 1, points: [{ ...mixedPoint(), stateId: -500 }] }))
    expect(store.error).toContain('未知地图')
    expect(disk.points).toHaveLength(1)
  })

  it('clears Z and verification when taking a new map position', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load()
    store.selectPoint('mixed-point')
    store.pickMapPosition(20.8, -19.3)
    expect(store.draft?.coordinate).toEqual({ x: 21, y: -19, z: null })
    expect(store.draft?.status).toBe('draft')
    await store.saveDraft('verified')
    expect(store.error).toContain('XYZ')
    expect(saveEditorLibrary).not.toHaveBeenCalled()
  })
})
