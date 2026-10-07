import { createPinia, setActivePinia } from 'pinia'
import { nextTick, watchEffect } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePointEditorStore } from '../src/stores/point-editor.ts'
import { useExplorerStore } from '../src/stores/explorer.ts'
import { loadMapAssetCatalog, loadMapDataset } from '../src/data/load.ts'
import { readEditorLibrary, saveEditorLibrary } from '../src/data/editor-client.ts'
import { referenceDataset, mixedPoint, smallEcho, eliteEcho } from './fixtures/point-library.ts'
import type { MapStateDefinition, PointLibrary } from '../src/domain/types.ts'
import { commitCoordinateInput, editCoordinateInput, emptyCoordinateInput } from '../src/components/base/coordinate-input.ts'
import { navigationPointTypeIds, navigationPointTypes } from '../src/domain/navigation-point-types.ts'
import { navigationIconById, navigationTypeIcons } from '../src/domain/navigation-icons.ts'
import { editorLibraryLocations, libraryLocations, parsePointLibrary } from '../src/domain/point-library.ts'
import { mapDatasetSchema } from '../src/domain/schema.ts'
import { isMapPointVisibleAtZoom } from '../src/map/point-visibility.ts'
import { parseTileId } from '../src/map/projection.ts'

vi.mock('../src/data/load.ts')
vi.mock('../src/data/editor-client.ts')
let disk: PointLibrary
let revision: number
const cache = new Map<string, string>()

function floorEditorDataset() {
  return { ...referenceDataset, states: referenceDataset.states.map((state): MapStateDefinition => state.id !== 8 ? state : {
    ...state,
    layeredMaps: [
      { id: 'a', name: '甲区域', coverage: [
        { tile: '1_0.png', size: 2, runs: [[0, 1]] },
        { tile: '2_0.png', size: 2, runs: [[0, 4]] },
      ], floors: [
        { id: 'a1', name: '甲上层', layeredMapId: 'a', tiles: ['/a/1/1_0.png', '/a/1/2_0.png'] },
        { id: 'a2', name: '甲下层', layeredMapId: 'a', tiles: ['/a/2/1_0.png'] },
        { id: 'empty', name: '空层', layeredMapId: 'a', tiles: [] },
      ] },
      { id: 'b', name: '乙区域', coverage: [{ tile: '1_0.png', size: 2, runs: [[3, 4]] }], floors: [
        { id: 'b1', name: '乙层', layeredMapId: 'b', tiles: ['/b/1/1_0.png'] },
      ] },
    ],
  }) }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  cache.clear()
  useExplorerStore().setDataset(referenceDataset)
  vi.stubGlobal('localStorage', { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => cache.set(key, value), removeItem: (key: string) => cache.delete(key) })
  disk = { version: 1, points: [] }
  revision = 1
  vi.mocked(loadMapDataset).mockResolvedValue({ dataset: referenceDataset, officialLibrary: { version: 1, points: [] } })
  vi.mocked(readEditorLibrary).mockImplementation(async () => ({ library: disk, revision: String(revision), storage: 'project' }))
  vi.mocked(saveEditorLibrary).mockImplementation(async (library) => {
    disk = library
    revision += 1
    return { library, revision: String(revision), storage: 'project' }
  })
})
afterEach(() => vi.unstubAllGlobals())

function selectMapContext(context: { stateId: number, levelId?: string, gravityType?: 1 | 2 }): void {
  const explorer = useExplorerStore()
  explorer.selectState(context.stateId)
  explorer.selectLevel(context.levelId ?? null)
  explorer.selectGravity(context.gravityType ?? 1)
}

async function saveWithDuplicateConfirmation(store: ReturnType<typeof usePointEditorStore>): Promise<boolean> {
  const saving = store.savePoint()
  if (store.duplicateConfirmation) store.confirmDuplicate(true)
  return saving
}

describe('point editor actions', () => {
  it('keeps ten unique completed manual names, supports deletion, and restores them', async () => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('small-beacon')
    const icon = navigationTypeIcons('small-beacon')[0]
    if (icon) store.setIcon(icon.id)
    expect(store.recentNames).toEqual([])
    store.setPointType(null)
    store.setName('尚未完成的输入')
    expect(store.recentNames).toEqual([])
    for (let index = 0; index < 12; index += 1) store.recordManualName(`名称${index}`)
    const previous = store.recentNames
    store.recordManualName('  名称5  ')
    store.recordManualName('   ')
    expect(previous[0]).toBe('名称11')
    expect(store.recentNames).toEqual(['名称5', '名称11', '名称10', '名称9', '名称8', '名称7', '名称6', '名称4', '名称3', '名称2'])
    store.removeRecentName('名称5')
    store.removeRecentName('不存在')
    const expected = store.recentNames
    setActivePinia(createPinia())
    const reopened = usePointEditorStore()
    await reopened.load('navigation')
    expect(reopened.recentNames).toEqual(expected)
    expect(reopened.recentNames).not.toContain('名称5')
  })

  it('sanitizes saved recent names and keeps history usable without storage', async () => {
    cache.set('echo-map:point-editor:recent-names:v1', JSON.stringify([null, 12, '', '  ', '  名称  ', '名称', '另一名称']))
    const store = usePointEditorStore()
    await store.load('navigation')
    expect(store.recentNames).toEqual(['名称', '另一名称'])
    vi.stubGlobal('localStorage', {
      setItem: () => { throw new Error('Storage unavailable') },
    })
    store.recordManualName('新名称')
    store.removeRecentName('名称')
    expect(store.recentNames).toEqual(['新名称', '另一名称'])
  })

  it('syncs the map position and clears stale position and arrival input before saving', async () => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('small-beacon')
    store.setCoordinateText('-497, 449, 18')
    store.applyCoordinateText()
    store.setTeleportCoordinateText('-498, 450, 20')
    store.applyTeleportCoordinateText()
    store.setCoordinate('x', 'invalid')
    store.setTeleportCoordinate('z', 'invalid')
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, { x: -497, y: 449, z: 18 }, '999999,'))
    store.updateCoordinateInput(true, editCoordinateInput(store.arrivalInput, { x: -498, y: 450, z: 20 }, '999999,'))

    store.syncPosition([-496, 448])

    expect(store.draft?.coordinate).toEqual({ x: -496, y: 448, z: null })
    expect(store.draft).not.toHaveProperty('teleportCoordinate')
    expect(store.positionInput).toEqual(emptyCoordinateInput())
    expect(store.arrivalInput).toEqual(emptyCoordinateInput())
    expect(store.coordinateText).toBe('')
    expect(store.teleportCoordinateText).toBe('')
    expect(store.inputErrors).toEqual({})
    expect(store.inputValues).toEqual({})
    expect(store.tileSaveBlocked).toBe(false)
    expect(await store.savePoint()).toBe(false)
    store.setCoordinate('z', '19')
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]?.coordinate).toEqual({ x: -496, y: 448, z: 19 })
    expect(disk.points[0]).not.toHaveProperty('teleportCoordinate')
  })

  it('validates partial combined and axis input without reusing stale coordinates', async () => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('small-beacon')
    store.setCoordinateText('-497, 449, 18')
    store.applyCoordinateText()
    const coordinate = { x: -497, y: 449, z: 18 }
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, coordinate, '100000，'))
    expect(store.tileErrors.position).toContain('当前 X 未命中')
    expect(store.tileSaveBlocked).toBe(true)
    expect(await store.savePoint()).toBe(false)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, coordinate, '-497，'))
    expect(store.tileErrors.position).toBe('')
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, coordinate, ''))
    expect(store.tileErrors.position).toBe('')
    store.setCoordinate('x', '')
    store.setCoordinate('y', '100000')
    expect(store.tileErrors.position).toContain('当前 Y 未命中')
    store.updateCoordinateInput(true, editCoordinateInput(store.arrivalInput, { x: null, y: null, z: null }, '100000, '))
    expect(store.tileErrors.arrival).toContain('传送落点 X 未命中')
  })

  it('blocks editing outside tile coverage and preserves the stored point and draft', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load('echo')
    store.selectPoint('mixed-point')
    store.setCoordinate('x', '999999')
    expect(store.tileErrors.position).toContain('未命中')
    expect(await store.saveAllForms()).toBe(false)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    expect(disk.points[0]?.coordinate.x).toBe(-497)
    expect(store.draft?.coordinate.x).toBe(999999)
    store.setCoordinate('x', '-497')
    expect(store.tileSaveBlocked).toBe(false)
    expect(await store.savePoint()).toBe(true)
  })

  it('checks pending arrival input and permits removing the optional arrival', async () => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('small-beacon')
    store.setCoordinateText('-497, 449, 18')
    store.applyCoordinateText()
    store.updateCoordinateInput(true, editCoordinateInput(store.arrivalInput, { x: null, y: null, z: null }, '999999, 449, 18'))
    expect(store.tileErrors.arrival).toContain('未命中')
    expect(await store.savePoint()).toBe(false)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    store.setTeleportCoordinateText('')
    for (const axis of ['x', 'y', 'z'] as const) store.setTeleportCoordinate(axis, '')
    expect(store.tileSaveBlocked).toBe(false)
    expect(await store.savePoint()).toBe(true)
  })

  it('previews incomplete XY and requires explicit confirmation before persisting duplicates', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load('echo')
    store.newPoint('echo')
    store.addMember(smallEcho.id)
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, { x: null, y: null, z: null }, '-497, 449'))
    expect(store.duplicateCandidates).toHaveLength(1)
    expect(store.duplicateCandidates[0]?.heightDifference).toBeNull()
    store.setCoordinateText('-497, 449, 18')
    store.applyCoordinateText()
    const cancelled = store.savePoint()
    expect(store.duplicateConfirmation).toBe(true)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    expect(await store.savePoint()).toBe(false)
    store.confirmDuplicate(false)
    expect(await cancelled).toBe(false)
    const accepted = store.savePoint()
    store.confirmDuplicate(true)
    expect(await accepted).toBe(true)
    expect(disk.points).toHaveLength(2)
  })

  it('rechecks changed drafts and protects save-all during navigation', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load('echo')
    store.newPoint('echo')
    store.addMember(smallEcho.id)
    store.setCoordinateText('-497, 449, 18')
    store.applyCoordinateText()
    const saving = store.saveAllForms()
    expect(store.duplicateConfirmation).toBe(true)
    store.setCoordinate('x', '-496')
    store.confirmDuplicate(true)
    await nextTick()
    expect(store.duplicateConfirmation).toBe(true)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    store.confirmDuplicate(false)
    expect(await saving).toBe(false)
    expect(store.dirty).toBe(true)
  })

  it.each([
    ['central-beacon', 0], ['small-beacon', 9], ['entrance', 16],
  ] as const)('derives visibility from %s through saving, reloading and type changes', async (pointType, threshold) => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType(pointType)
    store.setCoordinateText('100, 100, 20')
    store.applyCoordinateText()
    expect(await store.savePoint()).toBe(true)
    const saved = disk.points[0]
    if (!saved || saved.kind !== 'navigation') throw new Error('需要定位点数据')
    expect(saved).not.toHaveProperty('displayTier')
    const parsed = parsePointLibrary(JSON.parse(JSON.stringify(disk)), referenceDataset)
    expect(parsed.points[0]).toEqual(saved)
    const location = libraryLocations(parsed, referenceDataset).navigationPoints[0]
    if (!location) throw new Error('需要地图定位点')
    for (const zoom of [0, 9, 15.99, 16, 35]) {
      expect(isMapPointVisibleAtZoom({ category: 'navigation', location }, zoom)).toBe(zoom >= threshold)
    }
    setActivePinia(createPinia())
    const reopened = usePointEditorStore()
    await reopened.load('navigation')
    reopened.selectPoint(saved.id)
    expect(reopened.draft).toMatchObject({ pointType })
    expect(reopened.dirty).toBe(false)
    for (const nextType of ['central-beacon', 'small-beacon', null] as const) {
      reopened.setPointType(nextType)
      const changed = editorLibraryLocations(reopened.draft ? [reopened.draft] : [], referenceDataset, 'navigation').navigationPoints[0]
      if (!changed) throw new Error('需要编辑中的定位点')
      const nextThreshold = nextType === 'central-beacon' ? 0 : nextType === 'small-beacon' ? 9 : 16
      for (const zoom of [0, 9, 15.99, 16, 35]) {
        expect(isMapPointVisibleAtZoom({ category: 'navigation', location: changed }, zoom)).toBe(zoom >= nextThreshold)
      }
    }
  })

  it.each(['navigation', 'echo'] as const)('offers floors at a transparent %s position and preserves the selection through saving and reopening', async (kind) => {
    const dataset = floorEditorDataset()
    useExplorerStore().setDataset(dataset)
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset, officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load(kind)
    expect(store.availableFloors).toEqual([])
    expect(store.pointLevelId).toBeNull()
    const empty = store.draft
    store.setLevel('a1')
    expect(store.draft).toBe(empty)
    store.setCoordinateText('100, 600, 20')
    store.applyCoordinateText()
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2', 'b1'])
    store.setLevel('a2')
    expect(store.pointLevelId).toBe('a2')
    if (kind === 'navigation') store.setPointType('small-beacon')
    else store.addMember(smallEcho.id)
    expect(await store.savePoint()).toBe(true)
    const saved = disk.points[0]
    if (!saved) throw new Error('需要保存的点位')
    expect(saved.levelId).toBe('a2')
    const locations = libraryLocations(store.library, dataset)
    expect([...locations.echoLocations, ...locations.navigationPoints].find(({ id }) => id === saved.id)?.levelId).toBe('a2')
    setActivePinia(createPinia())
    const reopened = usePointEditorStore()
    await reopened.load(kind)
    reopened.selectPoint(saved.id)
    expect(reopened.pointLevelId).toBe('a2')
    expect(reopened.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2', 'b1'])
    expect(reopened.dirty).toBe(false)
    reopened.setLevel(null)
    expect(reopened.pointLevelId).toBeNull()
    expect(await reopened.savePoint()).toBe(true)
    expect(disk.points[0]?.levelId).toBeNull()
  })

  it('uses individual tile rectangles and closed edges without requiring alpha coverage', async () => {
    const dataset = floorEditorDataset()
    const state = dataset.states.find(({ id }) => id === 8)
    const group = state?.layeredMaps[0]
    const floor = group?.floors[0]
    if (!state || !group || !floor) throw new Error('需要测试楼层')
    group.coverage = []
    floor.tiles = ['/a/1/1_0.png', '/a/1/3_0.png']
    useExplorerStore().setDataset(dataset)
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset, officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load('navigation')
    for (const coordinate of ['0, 0, 20', '850, 850, 20', '100, 600, 20']) {
      store.setCoordinateText(coordinate)
      store.applyCoordinateText()
      expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2', 'b1'])
    }
    store.setCoordinateText('1000, 100, 20')
    store.applyCoordinateText()
    expect(store.availableFloors).toEqual([])
    store.setCoordinateText('1800, 100, 20')
    store.applyCoordinateText()
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1'])
  })

  it('derives floor options from the latest XY buffer without requiring Z or using arrival coordinates', async () => {
    useExplorerStore().setDataset(floorEditorDataset())
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset: floorEditorDataset(), officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('small-beacon')
    const empty = { x: null, y: null, z: null }
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '100, 100'))
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2', 'b1'])
    store.setLevel('a2')
    expect(store.pointLevelId).toBe('a2')
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '100, 600'))
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2', 'b1'])
    expect(store.pointLevelId).toBe('a2')
    expect(store.draft?.levelId).toBe('a2')
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '600, 600'))
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2', 'b1'])
    store.setLevel('b1')
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '600,'))
    expect(store.availableFloors).toEqual([])
    expect(store.pointLevelId).toBeNull()
    const full = editCoordinateInput(store.positionInput, empty, '600, 600, 20')
    store.updateCoordinateInput(false, commitCoordinateInput(full.state, full.value))
    expect(store.pointLevelId).toBe('b1')
    store.setTeleportCoordinateText('10000, 10000, 50')
    store.applyTeleportCoordinateText()
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2', 'b1'])
    expect(store.pointLevelId).toBe('b1')
  })

  it('returns to the base map when coordinate edits leave the selected floor and rejects unrelated floors', async () => {
    useExplorerStore().setDataset(floorEditorDataset())
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset: floorEditorDataset(), officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load('navigation')
    selectMapContext({ stateId: 8, levelId: 'a2' })
    expect(store.pointLevelId).toBeNull()
    store.setCoordinateText('100, 100, 20')
    store.applyCoordinateText()
    expect(store.pointLevelId).toBe('a2')
    store.setCoordinate('x', '1000')
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1'])
    expect(store.draft?.levelId).toBeNull()
    for (const invalid of ['a2', 'b1', 'empty', 'unknown', 1]) store.setLevel(invalid)
    expect(store.pointLevelId).toBeNull()
    store.setLevel('a1')
    expect(store.pointLevelId).toBe('a1')
    store.setCoordinateText('100, 900, 20')
    store.applyCoordinateText()
    expect(store.availableFloors).toEqual([])
    expect(store.pointLevelId).toBeNull()
    expect(store.draft?.levelId).toBeNull()
    store.setCoordinateText('100, 100, 20')
    store.applyCoordinateText()
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2', 'b1'])
    expect(store.pointLevelId).toBeNull()
    useExplorerStore().selectState(900)
    expect(store.availableFloors).toEqual([])
    expect(store.pointLevelId).toBeNull()
  })

  it('keeps echoes hidden throughout the initial navigation session and a cached reopen', async () => {
    const store = usePointEditorStore()
    store.setReferenceData(referenceDataset, { version: 1, points: [{
      ...mixedPoint('official:source'), officialIds: ['source'], coordinate: { x: 1, y: 2, z: 0 },
    }] })
    const echoCounts: number[] = []
    const stop = watchEffect(() => {
      echoCounts.push(editorLibraryLocations(store.allPoints, referenceDataset, store.editorMode).echoLocations.length)
    }, { flush: 'sync' })
    const response = Promise.withResolvers<Awaited<ReturnType<typeof readEditorLibrary>>>()
    vi.mocked(readEditorLibrary).mockReturnValueOnce(response.promise)
    const loading = store.load()
    try {
      await nextTick()
      expect(store.busy).toBe(true)
      expect(store.editorMode).toBe('navigation')
      expect(echoCounts.every((count) => count === 0)).toBe(true)
      response.resolve({ library: disk, revision: String(revision), storage: 'project' })
      await loading
      expect(store.draft?.kind).toBe('navigation')
      expect(echoCounts.every((count) => count === 0)).toBe(true)

      store.switchEditorTab('echo')
      expect(echoCounts.at(-1)).toBe(1)
      store.resetSession()
      expect(store.editorMode).toBe('navigation')
      echoCounts.length = 0
      await store.load()
      expect(store.draft?.kind).toBe('navigation')
      expect(echoCounts.every((count) => count === 0)).toBe(true)
      expect(readEditorLibrary).toHaveBeenCalledTimes(1)
    } finally {
      response.resolve({ library: disk, revision: String(revision), storage: 'project' })
      await loading
      stop()
    }
  })

  it.each(['echo', 'navigation'] as const)('uses the requested %s tab before loading and retains it after a failed load and retry', async (kind) => {
    const store = usePointEditorStore()
    store.setReferenceData(referenceDataset, { version: 1, points: [] })
    store.switchEditorTab(kind === 'echo' ? 'navigation' : 'echo')
    const response = Promise.withResolvers<Awaited<ReturnType<typeof readEditorLibrary>>>()
    vi.mocked(readEditorLibrary).mockReturnValueOnce(response.promise)
    const loading = store.load(kind)
    try {
      await nextTick()
      expect(store.busy).toBe(true)
      expect(store.editorMode).toBe(kind)
    } finally {
      response.reject(new Error('暂时不可用'))
      await loading
    }
    expect(store.error).toBe('暂时不可用')
    expect(store.editorMode).toBe(kind)
    await store.load(kind)
    expect(store.editorMode).toBe(kind)
    expect(store.draft?.kind).toBe(kind)
    expect(store.error).toBe('')
  })

  it('exposes the current operation and clears loading after saves, deletions, and imports', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    const loading = store.load('echo')
    expect(store.operation).toBe('load')
    expect(store.busy).toBe(true)
    await loading
    expect(store.operation).toBeNull()
    store.selectPoint(disk.points[0]?.id ?? '')
    store.setCoordinate('x', '123')
    const saving = store.savePoint()
    expect(store.operation).toBe('save')
    expect(store.busy).toBe(true)
    await saving
    expect(store.operation).toBeNull()
    const deleting = store.deletePoint()
    expect(store.operation).toBe('delete')
    await deleting
    expect(store.operation).toBeNull()
    store.previewImport(JSON.stringify({ version: 1, points: [] }))
    const importing = store.applyImport()
    expect(store.operation).toBe('import')
    await importing
    expect(store.operation).toBeNull()
    expect(store.busy).toBe(false)
  })

  it('clears the operation on failure and does not enter loading for invalid input', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    expect(await store.savePoint()).toBe(false)
    expect(store.operation).toBeNull()
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    store.addMember(smallEcho.id)
    vi.mocked(saveEditorLibrary).mockRejectedValueOnce(new Error('保存失败'))
    const saving = store.savePoint()
    expect(store.operation).toBe('save')
    expect(await saving).toBe(false)
    expect(store.operation).toBeNull()
    expect(store.busy).toBe(false)
    expect(store.error).toBe('保存失败')
  })

  it.each(['project', 'browser'] as const)('announces each completed save in %s storage and clears stale success on failure', async (storage) => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('small-beacon')
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    for (let index = 0; index < 2; index += 1) {
      const response = Promise.withResolvers<Awaited<ReturnType<typeof saveEditorLibrary>>>()
      vi.mocked(saveEditorLibrary).mockReturnValueOnce(response.promise)
      const saving = store.savePoint()
      expect(store.notice).toBe('')
      const saved = vi.mocked(saveEditorLibrary).mock.calls.at(-1)?.[0]
      if (!saved) throw new Error('Missing saved library')
      response.resolve({ library: saved, revision: String(index + 2), storage })
      expect(await saving).toBe(true)
      expect(store.notice).toBe('保存成功')
    }
    vi.mocked(saveEditorLibrary).mockRejectedValueOnce(new Error('保存失败'))
    expect(await store.savePoint()).toBe(false)
    expect(store.notice).toBe('')
    expect(store.error).toBe('保存失败')
  })

  it('initializes a pristine draft from validated map context without making it dirty', async () => {
    const floorState = referenceDataset.states.find(({ layeredMaps }) => layeredMaps.some(({ floors }) => floors.length > 0))
    const floor = floorState?.layeredMaps.flatMap(({ floors }) => floors)[0]
    const country = referenceDataset.regionLabels.find(({ level }) => level === 1)
    const countryState = referenceDataset.states.find(({ id }) => id === country?.stateId)
    const gravityState = referenceDataset.states.find(({ gravityTiles }) => gravityTiles.length > 0)
    if (!floorState || !floor || !country || !countryState || !gravityState) throw new Error('测试数据缺少可用于录入上下文的地图')
    const store = usePointEditorStore()
    await store.load('echo')
    selectMapContext({ stateId: countryState.id })
    expect(store.draft).toMatchObject({
      stateId: countryState.id,
      levelId: null,
    })
    selectMapContext({ stateId: floorState.id, levelId: floor.id })
    expect(store.draft).toMatchObject({
      stateId: floorState.id,
      levelId: null,
    })
    selectMapContext({ stateId: gravityState.id, gravityType: 2 })
    expect(store.draft).toMatchObject({
      stateId: gravityState.id,
      levelId: null,
      gravityType: 2,
    })
    expect(store.dirty).toBe(false)

    useExplorerStore().restoreUrlState({ stateId: gravityState.id, levelId: 'unknown', gravityType: 2 })
    expect(store.draft).toMatchObject({ stateId: gravityState.id, levelId: null, gravityType: 2 })
    expect(store.dirty).toBe(false)
  })

  it.each(['navigation', 'echo'] as const)('keeps %s input and saves on the map selected after starting a new point', async (kind) => {
    const store = usePointEditorStore()
    const explorer = useExplorerStore()
    explorer.setDataset(referenceDataset)
    await store.load(kind)
    if (kind === 'navigation') store.setPointType('small-beacon')
    else store.addMember(smallEcho.id)
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    store.setNote('保留录入内容')
    const previous = store.draft
    expect(store.confirmPosition(true, 0)).toBe('wait')
    const destination = referenceDataset.regionLabels.find(({ stateId, id }) => stateId !== explorer.selectedStateId
      && referenceDataset.mapNavigation.some(({ regionIds }) => regionIds.includes(id)))
    if (!destination || !previous) throw new Error('缺少跨地图测试数据')

    explorer.navigateToRegion(destination.id)

    expect(store.draft).toMatchObject({ ...previous, stateId: destination.stateId, levelId: null, gravityType: null })
    expect(store.dirty).toBe(true)
    expect(store.tileSaveBlocked).toBe(true)
    expect(store.confirmPosition(true, 100)).toBe('wait')
    expect(await store.savePoint()).toBe(false)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    const tileId = referenceDataset.states.find(({ id }) => id === destination.stateId)?.tileIds[0]
    const tile = tileId ? parseTileId(tileId) : null
    if (!tile) throw new Error('目标地图缺少瓦片')
    const coordinate = { x: Math.round((tile.x - 0.5) * 850), y: Math.round((0.5 - tile.y) * 850), z: 30 }
    store.setCoordinateText(`${coordinate.x}, ${coordinate.y}, ${coordinate.z}`)
    store.applyCoordinateText()
    expect(store.tileSaveBlocked).toBe(false)
    expect(store.confirmPosition(false, 100)).toBe('locate')
    expect(store.confirmPosition(true, 200)).toBe('wait')
    expect(store.confirmPosition(true, 300)).toBe('save')
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]).toMatchObject({ id: previous.id, stateId: destination.stateId, coordinate, note: previous.note })
  })

  it('preserves pending coordinate buffers while clearing floor and gravity from the previous map', async () => {
    useExplorerStore().setDataset(floorEditorDataset())
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset: floorEditorDataset(), officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load('navigation')
    selectMapContext({ stateId: 8, levelId: 'a2' })
    store.setPointType('small-beacon')
    const empty = { x: null, y: null, z: null }
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '100, 100'))
    store.updateCoordinateInput(true, editCoordinateInput(store.arrivalInput, empty, '110,'))
    const position = store.positionInput
    const arrival = store.arrivalInput
    expect(store.pointLevelId).toBe('a2')
    expect(store.pointLevelId).toBe('a2')
    useExplorerStore().selectState(903)
    expect(store.draft).toMatchObject({ stateId: 903, levelId: null, gravityType: 1 })
    useExplorerStore().selectGravity(2)
    useExplorerStore().selectState(900)
    expect(store.draft).toMatchObject({ stateId: 900, levelId: null, gravityType: null })
    expect(store.positionInput).toBe(position)
    expect(store.arrivalInput).toBe(arrival)
    expect(store.confirmPosition(false)).toBe('locate')
    expect(await store.savePoint()).toBe(false)
  })

  it('keeps map changes out of form dirty state and restores the map when opening an existing point', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load('echo')
    useExplorerStore().selectState(900)
    expect(store.draft?.stateId).toBe(900)
    expect(store.dirty).toBe(false)
    store.selectPoint('mixed-point')
    expect(useExplorerStore().selectedStateId).toBe(8)
    expect(store.draft?.stateId).toBe(8)
    store.setNote('已有点位的修改')
    useExplorerStore().selectState(900)
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]).toMatchObject({ stateId: 900, note: '已有点位的修改' })
  })

  it('uses the latest gravity in both tabs, duplicate checks and save-all', async () => {
    const original = { ...mixedPoint(), stateId: 903, gravityType: 1 as const }
    disk = { version: 1, points: [original] }
    const explorer = useExplorerStore()
    explorer.selectState(903)
    const store = usePointEditorStore()
    await store.load('echo')
    store.addMember(smallEcho.id)
    store.setCoordinateText('-497, 449, 18')
    store.applyCoordinateText()
    expect(store.duplicateCandidates).toHaveLength(1)
    store.switchEditorTab('navigation')
    store.setPointType('small-beacon')
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    explorer.selectGravity(2)
    expect(store.draft?.gravityType).toBe(2)
    store.switchEditorTab('echo')
    expect(store.draft?.gravityType).toBe(2)
    expect(store.duplicateCandidates).toHaveLength(0)
    expect(await store.saveAllForms()).toBe(true)
    expect(disk.points.filter(({ id }) => id !== original.id).map(({ gravityType }) => gravityType)).toEqual([2, 2])
  })

  it('rechecks live gravity after duplicate confirmation before saving', async () => {
    disk = { version: 1, points: [{ ...mixedPoint(), stateId: 903, gravityType: 1 }] }
    const explorer = useExplorerStore()
    explorer.selectState(903)
    const store = usePointEditorStore()
    await store.load('echo')
    store.addMember(smallEcho.id)
    store.setCoordinateText('-497, 449, 18')
    store.applyCoordinateText()
    const saving = store.savePoint()
    expect(store.duplicateConfirmation).toBe(true)
    explorer.selectGravity(2)
    store.confirmDuplicate(true)
    expect(await saving).toBe(true)
    expect(disk.points[1]?.gravityType).toBe(2)
  })

  it('follows live floor selection until a floor is explicitly chosen in the form', async () => {
    const dataset = floorEditorDataset()
    const explorer = useExplorerStore()
    explorer.setDataset(dataset)
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset, officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('small-beacon')
    store.setCoordinateText('100, 100, 20')
    store.applyCoordinateText()
    explorer.selectLevel('a1')
    expect(store.pointLevelId).toBe('a1')
    explorer.selectLevel('a2')
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]?.levelId).toBe('a2')
    explorer.selectLevel('a1')
    expect(store.pointLevelId).toBe('a1')
    store.setLevel(null)
    explorer.selectLevel('a2')
    expect(store.pointLevelId).toBeNull()
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]?.levelId).toBeNull()
    store.setLevel('a1')
    explorer.selectState(903)
    expect(store.pointLevelId).toBeNull()
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]).toMatchObject({ stateId: 903, gravityType: 1, levelId: null })
  })

  it.each(['selection', 'region', 'url'] as const)('clears both form floors on %s map changes without restoring them on return', async (method) => {
    const dataset = floorEditorDataset()
    const explorer = useExplorerStore()
    explorer.setDataset(dataset)
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset, officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load('echo')
    store.addMember(smallEcho.id)
    store.setCoordinateText('100, 100, 20')
    store.applyCoordinateText()
    store.setLevel('a1')
    store.switchEditorTab('navigation')
    store.setPointType('small-beacon')
    store.setCoordinateText('110, 110, 30')
    store.applyCoordinateText()
    store.setLevel('a2')
    const destination = dataset.regionLabels.find(({ stateId, id }) => stateId !== 8
      && dataset.mapNavigation.some(({ regionIds }) => regionIds.includes(id)))
    if (!destination) throw new Error('缺少跨地图测试数据')
    if (method === 'selection') explorer.selectState(destination.stateId)
    else if (method === 'region') explorer.navigateToRegion(destination.id)
    else explorer.restoreUrlState({ stateId: destination.stateId })
    explorer.restoreUrlState({ stateId: 8, levelId: 'a2' })
    expect(store.pointLevelId).toBeNull()
    expect(store.draft?.coordinate).toEqual({ x: 110, y: 110, z: 30 })
    store.switchEditorTab('echo')
    expect(store.pointLevelId).toBeNull()
    expect(store.draft?.coordinate).toEqual({ x: 100, y: 100, z: 20 })
    expect(await store.saveAllForms()).toBe(true)
    expect(disk.points.map(({ levelId }) => levelId)).toEqual([null, null])
  })

  it('does not restore a cleared floor when an in-flight save completes', async () => {
    const dataset = floorEditorDataset()
    const explorer = useExplorerStore()
    explorer.setDataset(dataset)
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset, officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('small-beacon')
    store.setCoordinateText('100, 100, 20')
    store.applyCoordinateText()
    store.setLevel('a1')
    const saving = store.savePoint()
    explorer.selectState(903)
    explorer.selectState(8)
    expect(await saving).toBe(true)
    expect(store.pointLevelId).toBeNull()
    expect(disk.points[0]?.levelId).toBe('a1')
  })

  it('saves nearby points independently and stays on the saved point', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load('echo')
    expect(store.editing).toBe(true)
    store.newPoint('echo')
    store.setCoordinateText('-496, 449, 18')
    store.applyCoordinateText()
    store.addMember(smallEcho.id)
    store.addMember(smallEcho.id)
    store.addMember(eliteEcho.id)
    const id = store.draft?.id
    expect(await saveWithDuplicateConfirmation(store)).toBe(true)
    expect(disk.points).toHaveLength(2)
    expect(store.draft?.id).toBe(id)
    expect(store.dirty).toBe(false)
    expect(cache.size).toBe(0)
    expect(store.draft?.kind === 'echo' ? store.draft.members : []).toEqual([{ echoId: smallEcho.id, count: 2 }, { echoId: eliteEcho.id, count: 1 }])
    expect(store.draft?.kind === 'echo' ? store.draft.compositionStatus : '').toBe('partial')
    store.newPoint('navigation')
    expect(store.draft?.coordinate).toEqual({ x: null, y: null, z: null })
    expect(store.draft?.stateId).toBe(8)
  })

  it.each(['navigation', 'echo'] as const)('creates successive %s points after saving and editing without overwriting earlier points', async (kind) => {
    const store = usePointEditorStore()
    await store.load(kind)
    for (const x of [10, 20]) {
      store.setCoordinateText(`${x}, 2, 3`)
      store.applyCoordinateText()
      if (kind === 'navigation') store.setPointType('small-beacon')
      else store.addMember(smallEcho.id)
      const id = store.draft?.id
      expect(await saveWithDuplicateConfirmation(store)).toBe(true)
      expect(store.draft?.id).toBe(id)
      store.newPoint()
      expect(store.draft?.id).not.toBe(id)
      expect(store.draft).toMatchObject({ kind, coordinate: { x: null, y: null, z: null } })
      expect(store.dirty).toBe(false)
    }
    expect(disk.points).toHaveLength(2)
    expect(new Set(disk.points.map(({ id }) => id)).size).toBe(2)
    expect(disk.points.map(({ coordinate }) => coordinate.x)).toEqual([10, 20])

    const first = disk.points[0]
    if (!first) throw new Error('需要已保存点位')
    store.selectPoint(first.id)
    store.setCoordinate('x', '11')
    expect(await saveWithDuplicateConfirmation(store)).toBe(true)
    store.newPoint()
    expect(disk.points).toHaveLength(2)
    expect(disk.points.map(({ coordinate }) => coordinate.x)).toEqual([11, 20])
    expect(disk.points.some(({ id }) => id === store.draft?.id)).toBe(false)
    expect(store.draft?.coordinate).toEqual({ x: null, y: null, z: null })
  })

  it.each([true, false])('saves on double Enter after entering the viewport (already visible: %s), then starts the next point afresh', async (inView) => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setContinueAdding(true)
    store.setPointType('small-beacon')
    for (const x of [1, 2]) {
      const pressEnter = (visible: boolean, time: number) => {
        const coordinate = store.draft?.coordinate ?? { x: null, y: null, z: null }
        const edited = editCoordinateInput(store.positionInput, coordinate, `${x}, 2, 3`)
        store.updateCoordinateInput(false, commitCoordinateInput(edited.state, edited.value))
        return store.confirmPosition(visible, time)
      }
      if (!inView) expect(pressEnter(false, 0)).toBe('locate')
      expect(pressEnter(true, 5000)).toBe('wait')
      expect(pressEnter(true, 5300)).toBe('save')
      expect(await saveWithDuplicateConfirmation(store)).toBe(true)
      expect(store.draft?.coordinate).toEqual({ x: null, y: null, z: null })
      expect(store.confirmPosition(true, 5350)).toBe('wait')
    }
    expect(disk.points).toHaveLength(2)
    expect(new Set(disk.points.map(({ id }) => id)).size).toBe(2)
  })

  it('restarts the final Enter pair after a pause, interruption, coordinate edit or loss of viewport visibility', async () => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    expect(store.confirmPosition(false, 0)).toBe('locate')
    expect(store.confirmPosition(false, 100)).toBe('locate')
    expect(store.confirmPosition(true, 200)).toBe('wait')
    expect(store.confirmPosition(true, 1000)).toBe('wait')
    expect(store.confirmPosition(true, 1100)).toBe('save')
    expect(store.confirmPosition(true, 1200)).toBe('wait')
    store.resetPositionConfirmation()
    expect(store.confirmPosition(true, 1300)).toBe('wait')
    expect(store.confirmPosition(true, 1400)).toBe('save')
    expect(store.confirmPosition(true, 1500)).toBe('wait')
    store.setCoordinate('z', '4')
    expect(store.confirmPosition(true, 1600)).toBe('wait')
    expect(store.confirmPosition(true, 1700)).toBe('save')
    expect(store.confirmPosition(true, 1750)).toBe('wait')
    expect(store.confirmPosition(false, 1800)).toBe('locate')
    expect(store.confirmPosition(true, 1900)).toBe('wait')
    expect(store.confirmPosition(true, 2000)).toBe('save')
    expect(saveEditorLibrary).not.toHaveBeenCalled()
  })

  it('locates incomplete XY input but never arms saving until XYZ is complete and valid', async () => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    for (const text of ['4, 5', '4, 5, 1.5', 'invalid']) {
      const edited = editCoordinateInput(store.positionInput, { x: 1, y: 2, z: 3 }, text)
      store.updateCoordinateInput(false, commitCoordinateInput(edited.state, edited.value))
      for (const time of [0, 100, 200, 300]) {
        expect(store.confirmPosition(true, time)).toBe(text === 'invalid' ? 'wait' : 'locate')
      }
    }
    store.updateCoordinateInput(false, { state: { ...emptyCoordinateInput(), mode: 'axes' }, value: { x: 4, y: 5, z: null }, valid: true })
    expect(store.confirmPosition(true, 0)).toBe('locate')
    expect(store.confirmPosition(true, 100)).toBe('locate')
    expect(saveEditorLibrary).not.toHaveBeenCalled()
  })

  it('retains normal save validation and ignores Enter while a save is in progress', async () => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    expect(store.confirmPosition(true, 0)).toBe('wait')
    expect(store.confirmPosition(true, 100)).toBe('save')
    expect(await store.savePoint()).toBe(false)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    store.setPointType('small-beacon')
    expect(store.confirmPosition(true, 300)).toBe('wait')
    expect(store.confirmPosition(true, 400)).toBe('save')
    const response = Promise.withResolvers<Awaited<ReturnType<typeof saveEditorLibrary>>>()
    vi.mocked(saveEditorLibrary).mockReturnValueOnce(response.promise)
    const saving = store.savePoint()
    expect(store.confirmPosition(true, 600)).toBe('wait')
    expect(store.confirmPosition(true, 700)).toBe('wait')
    response.reject(new Error('保存失败'))
    expect(await saving).toBe(false)
    expect(store.confirmPosition(true, 800)).toBe('wait')
    expect(saveEditorLibrary).toHaveBeenCalledTimes(1)
  })

  it('persists the continue-adding preference immediately across editor sessions and fresh stores', async () => {
    const store = usePointEditorStore()
    await store.load('navigation')
    expect(store.continueAdding).toBe(false)
    store.setContinueAdding(true)
    expect(cache.get('echo-map:point-editor:continue-adding:v1')).toBe('true')
    expect(store.hasUnsavedChanges).toBe(false)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    store.resetSession()
    await store.load('navigation')
    expect(store.continueAdding).toBe(true)
    setActivePinia(createPinia())
    const reopened = usePointEditorStore()
    await reopened.load('navigation')
    expect(reopened.continueAdding).toBe(true)
    reopened.setPointType('small-beacon')
    reopened.setCoordinateText('1, 2, 3')
    reopened.applyCoordinateText()
    const id = reopened.draft?.id
    expect(await reopened.savePoint()).toBe(true)
    expect(reopened.draft?.id).not.toBe(id)
    reopened.setContinueAdding(false)
    expect(cache.get('echo-map:point-editor:continue-adding:v1')).toBe('false')
    setActivePinia(createPinia())
    const unchecked = usePointEditorStore()
    await unchecked.load('navigation')
    expect(unchecked.continueAdding).toBe(false)
    expect(unchecked.hasUnsavedChanges).toBe(false)
  })

  it.each(['invalid', 'null', '{}', '1', '"true"'])('ignores invalid continue-adding preference %s', async (value) => {
    cache.set('echo-map:point-editor:continue-adding:v1', value)
    const store = usePointEditorStore()
    await store.load('navigation')
    expect(store.continueAdding).toBe(false)
    expect(store.error).toBe('')
  })

  it('keeps continue-adding usable in memory when browser storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (key.includes(':continue-adding:')) throw new Error('Storage unavailable')
        return cache.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (key.includes(':continue-adding:')) throw new Error('Storage unavailable')
        cache.set(key, value)
      },
      removeItem: (key: string) => cache.delete(key),
    })
    const store = usePointEditorStore()
    await store.load('navigation')
    expect(store.continueAdding).toBe(false)
    store.setContinueAdding(true)
    store.resetSession()
    await store.load('navigation')
    expect(store.continueAdding).toBe(true)
    store.setContinueAdding(false)
    expect(store.continueAdding).toBe(false)
    expect(store.error).toBe('')
    expect(store.notice).toBe('')
  })

  it.each(['central-beacon', 'small-beacon', 'material-domain'] as const)('continues adding %s with its name, icon and map context', async (pointType) => {
    const dataset = floorEditorDataset()
    useExplorerStore().setDataset(dataset)
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset, officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load('navigation')
    expect(store.continueAdding).toBe(false)
    expect(store.canContinueAdding).toBe(true)
    const state = dataset.states.find(({ id }) => id === 8)
    const floor = state?.layeredMaps.flatMap(({ floors }) => floors)[0]
    if (!state || !floor) throw new Error('需要分层地图')
    selectMapContext({ stateId: state.id, levelId: floor.id })
    store.setContinueAdding(true)
    store.setPointType(pointType)
    const rule = navigationPointTypes[pointType]
    for (const x of [10, 20]) {
      store.setCoordinateText(`${x}, 2, 3`)
      store.applyCoordinateText()
      store.setTeleportCoordinateText(`${x + 1}, 2, 3`)
      store.applyTeleportCoordinateText()
      store.setNote('仅当前点位的备注')
      if (!rule.names.length) store.setName('连续录入的材料副本名称')
      const savedId = store.draft?.id
      expect(await saveWithDuplicateConfirmation(store)).toBe(true)
      expect(disk.points.find(({ id }) => id === savedId)).toMatchObject({
        pointType, coordinate: { x, y: 2, z: 3 }, teleportCoordinate: { x: x + 1, y: 2, z: 3 },
      })
      expect(store.draft?.id).not.toBe(savedId)
      expect(store.draft).toMatchObject({
        kind: 'navigation', pointType, name: rule.names[0] ?? '连续录入的材料副本名称', iconId: rule.icons[0],
        mode: rule.defaultMode, stateId: state.id, levelId: null, note: '', coordinate: { x: null, y: null, z: null },
      })
      expect(store.draft).not.toHaveProperty('teleportCoordinate')
      expect(store.coordinateText).toBe('')
      expect(store.teleportCoordinateText).toBe('')
      expect(store.positionInput.text).toBeNull()
      expect(store.arrivalInput.text).toBeNull()
      expect(store.inputErrors).toEqual({})
      expect(store.continueAdding).toBe(true)
      expect(store.canContinueAdding).toBe(true)
      expect(store.hasUnsavedChanges).toBe(false)
      expect(store.notice).toBe('保存成功')
      expect([...cache.keys()].some((key) => key.includes('point-editor:draft'))).toBe(false)
    }
    expect(disk.points).toHaveLength(2)
    expect(new Set(disk.points.map(({ id }) => id)).size).toBe(2)
    store.resetSession()
    expect(store.continueAdding).toBe(true)
    await store.load('navigation')
    expect(store.continueAdding).toBe(true)
  })

  it.each([
    ...navigationPointTypeIds.map((pointType) => ({ pointType, customIcon: false })),
    { pointType: null, customIcon: false },
  ])('retains name and icon when continuing $pointType (custom icon: $customIcon)', async ({ pointType }) => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setContinueAdding(true)
    store.setPointType(pointType)
    const defaults = store.draft
    expect(defaults?.kind).toBe('navigation')
    if (defaults?.kind !== 'navigation') throw new Error('需要定位点草稿')
    expect(defaults.name).toBe(pointType ? navigationPointTypes[pointType].names[0] ?? navigationPointTypes[pointType].name : '')
    {
      const icon = navigationTypeIcons(pointType ?? undefined).at(-1)
      if (!icon) throw new Error('需要候选图标')
      store.setIcon(icon.id)
    }
    store.setName('当前点位的自定义名称')
    store.setMode('fast-travel')
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    const saved = store.draft
    if (saved?.kind !== 'navigation') throw new Error('需要定位点草稿')
    expect(await store.savePoint()).toBe(true)
    expect(store.draft).toMatchObject({
      name: saved.name, mode: defaults.mode, coordinate: { x: null, y: null, z: null },
    })
    if (saved.iconId) expect(store.draft).toHaveProperty('iconId', saved.iconId)
    else expect(store.draft).not.toHaveProperty('iconId')
    if (pointType) expect(store.draft).toHaveProperty('pointType', pointType)
    else expect(store.draft).not.toHaveProperty('pointType')
    expect(store.notice).toBe('保存成功')
    expect(store.hasUnsavedChanges).toBe(false)
  })

  it('continues only after persistence succeeds and retains the same draft on validation or save failure', async () => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setContinueAdding(true)
    store.setPointType('small-beacon')
    const id = store.draft?.id
    expect(await store.savePoint()).toBe(false)
    expect(store.draft?.id).toBe(id)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    const response = Promise.withResolvers<Awaited<ReturnType<typeof saveEditorLibrary>>>()
    vi.mocked(saveEditorLibrary).mockReturnValueOnce(response.promise)
    const saving = store.savePoint()
    expect(store.draft?.id).toBe(id)
    expect(store.busy).toBe(true)
    store.setContinueAdding(false)
    expect(store.continueAdding).toBe(true)
    response.reject(new Error('保存失败'))
    expect(await saving).toBe(false)
    expect(store.draft).toMatchObject({ id, pointType: 'small-beacon', coordinate: { x: 1, y: 2, z: 3 } })
    expect(disk.points).toHaveLength(0)
    expect(await store.savePoint()).toBe(true)
    expect(store.draft?.id).not.toBe(id)
    expect(store.notice).toBe('保存成功')
  })

  it('keeps saved navigation edits and echo saves on their current point even when continuing is enabled', async () => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('small-beacon')
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    const id = store.draft?.id
    expect(await store.savePoint()).toBe(true)
    expect(store.draft?.id).toBe(id)
    expect(store.canContinueAdding).toBe(false)
    store.setContinueAdding(true)
    store.setCoordinate('x', '10')
    expect(await store.savePoint()).toBe(true)
    expect(store.draft?.id).toBe(id)
    store.switchEditorTab('echo')
    expect(store.canContinueAdding).toBe(false)
    store.addMember(smallEcho.id)
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    const echoId = store.draft?.id
    expect(await store.savePoint()).toBe(true)
    expect(store.draft?.id).toBe(echoId)
    expect(disk.points).toHaveLength(2)
  })

  it.each(['pending-action', 'leave-editor'] as const)('does not create another draft while saving for %s', async (reason) => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setContinueAdding(true)
    store.setPointType('small-beacon')
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    const id = store.draft?.id
    expect(await (reason === 'leave-editor' ? store.saveAllForms() : store.savePoint({ continueAdding: false }))).toBe(true)
    expect(store.draft?.id).toBe(id)
    expect(disk.points[0]).not.toHaveProperty('status')
    expect(store.draft).toEqual(disk.points[0])
    expect(store.hasUnsavedChanges).toBe(false)
    expect(disk.points).toHaveLength(1)
  })

  it('keeps official points read-only without replacing or discarding either editing form', async () => {
    const official = { ...mixedPoint('official:one'), officialIds: ['one', 'two'], coordinate: { x: -497, y: 449, z: 0 } }
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset: referenceDataset, officialLibrary: { version: 1, points: [official] } })
    const store = usePointEditorStore()
    await store.load('echo')
    store.setCoordinate('x', '123')
    const echoDraft = store.draft
    store.switchEditorTab('navigation')
    store.setName('保留当前录入')
    const navigationDraft = store.draft
    const cached = [...cache.entries()]
    store.selectPoint(official.id)
    expect(store.editorMode).toBe('navigation')
    expect(store.draft).toBe(navigationDraft)
    expect(store.notice).toBe('官方点位为只读，不可编辑')
    expect([...cache.entries()]).toEqual(cached)
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    expect(store.library.points).toHaveLength(0)
    expect(store.allPoints).toEqual([official])
    expect(store.officialLibrary.points[0]).toEqual(official)
    store.switchEditorTab('echo')
    expect(store.draft).toEqual(echoDraft)
  })

  it('retains invalid edits and exposes field errors until corrected', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load('echo')
    store.selectPoint('mixed-point')
    store.setCoordinate('z', '1.5')
    store.setMemberCount(smallEcho.id, 0)
    store.newPoint('navigation')
    expect(store.draft?.id).toBe('mixed-point')
    expect(await store.savePoint()).toBe(false)
    expect(store.inputErrors.z).toBeTruthy()
    expect(store.inputErrors[`count:${smallEcho.id}`]).toBeTruthy()
    store.setCoordinate('z', '0')
    store.setMemberCount(smallEcho.id, 8)
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]?.coordinate.z).toBe(0)
    store.setCoordinate('x', '')
    expect(await store.savePoint()).toBe(false)
    expect(store.inputErrors.x).toBeTruthy()
    store.discardChanges()
    expect(store.draft?.coordinate.x).toBe(-497)
    expect(store.dirty).toBe(false)
  })

  it('keeps saved records separate from edits and becomes clean when the original value is restored', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load('echo')
    store.selectPoint('mixed-point')
    store.setCoordinate('x', '100')
    expect(store.dirty).toBe(true)
    expect(store.library.points).toEqual([mixedPoint()])
    expect(disk.points).toEqual([mixedPoint()])
    store.setCoordinate('x', '-497')
    expect(store.dirty).toBe(false)
    expect(cache.size).toBe(0)
    store.setCoordinate('x', '200')
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]).toEqual({ ...mixedPoint(), coordinate: { x: 200, y: 449, z: 18 } })
    expect(store.dirty).toBe(false)
  })

  it('requires a name and icon, persists icon selection, and validates optional arrival', async () => {
    const icon = navigationTypeIcons('small-beacon')[0]
    if (!icon) throw new Error('测试数据缺少信标图标')
    const store = usePointEditorStore()
    await store.load('echo')
    store.newPoint('navigation')
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    expect(await store.savePoint()).toBe(false)
    expect(store.inputErrors.name).toBeTruthy()
    expect(store.inputErrors.icon).toBeTruthy()
    expect(store.inputErrors.pointType).toBeUndefined()
    store.setPointType('small-beacon')
    const automaticIcon = store.draft?.kind === 'navigation' ? store.draft.iconId : undefined
    store.setName('测试信标')
    store.setIcon(icon.id)
    store.setMode('fast-travel')
    store.setTeleportCoordinate('x', '110')
    expect(await store.savePoint()).toBe(false)
    store.setTeleportCoordinateText('110, 220, 40')
    store.applyTeleportCoordinateText()
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]).toMatchObject({ name: '小型信标', iconId: automaticIcon, mode: 'fast-travel', coordinate: { x: 100, y: 200, z: 30 }, teleportCoordinate: { x: 110, y: 220, z: 40 } })
    store.clearTeleportCoordinate()
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]?.kind === 'navigation' ? disk.points[0].teleportCoordinate : null).toBeUndefined()
    store.setTeleportCoordinate('x', 'bad')
    store.setPointType('service')
    store.setIcon('icon-ac9e0de71d8ea258')
    expect(store.inputErrors['teleport:x']).toBeTruthy()
    store.setMode('landmark')
    expect(store.inputErrors['teleport:x']).toBeUndefined()
    expect(await store.savePoint()).toBe(true)
  })

  it('keeps failed saves in the current form for retry without caching them', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    store.addMember(smallEcho.id)
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    const point = store.draft
    vi.mocked(saveEditorLibrary).mockRejectedValueOnce(new Error('文件写入失败'))
    expect(await store.savePoint()).toBe(false)
    expect(store.error).toBe('文件写入失败')
    expect(store.dirty).toBe(true)
    expect(store.draft).toEqual(point)
    expect(cache.size).toBe(0)
    expect(disk.points).toEqual([])
    expect(await store.savePoint()).toBe(true)
    expect(disk.points).toEqual([point])
    expect(store.hasUnsavedChanges).toBe(false)
  })

  it('discards unsaved edits and new points on reload while preserving saved points', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load('echo')
    store.selectPoint('mixed-point')
    store.setCoordinate('x', '999')
    store.switchEditorTab('navigation')
    store.setName('未保存的定位点')
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    expect(store.hasUnsavedChanges).toBe(true)
    expect(cache.size).toBe(0)

    setActivePinia(createPinia())
    const reopened = usePointEditorStore()
    await reopened.load('navigation')
    expect(reopened.draft).toMatchObject({ name: '', coordinate: { x: null, y: null, z: null } })
    reopened.switchEditorTab('echo')
    expect(reopened.draft).toMatchObject({ members: [], coordinate: { x: null, y: null, z: null } })
    expect(reopened.hasUnsavedChanges).toBe(false)
    expect(reopened.library.points).toEqual([mixedPoint()])
    reopened.selectPoint('mixed-point')
    expect(reopened.draft).toEqual(mixedPoint())
    expect(cache.size).toBe(0)
  })

  it('opens the form immediately and preserves context when creating the next point', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    useExplorerStore().selectState(903)
    useExplorerStore().selectGravity(2)
    expect(store.dirty).toBe(false)
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    store.addMember(smallEcho.id)
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]?.gravityType).toBe(2)
    store.closeEditor()
    expect(store.editing).toBe(true)
    store.newPoint('navigation')
    expect(store.draft).toMatchObject({ stateId: 903, gravityType: 2, coordinate: { x: null, y: null, z: null } })
    useExplorerStore().selectState(8)
    expect(store.draft?.gravityType).toBeNull()
  })

  it('deletes a point and opens a new draft with a success message', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load('echo')
    store.selectPoint('mixed-point')
    await store.deletePoint()
    expect(disk.points).toEqual([])
    expect(store.editing).toBe(true)
    expect(store.library.points).toEqual([])
    expect(store.draft?.id).not.toBe('mixed-point')
    expect(store.dirty).toBe(false)
    expect(store.notice).toBe('点位已删除')
  })

  it('previews complete imports and rejects foreign references without writing', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    store.previewImport(JSON.stringify({ version: 1, points: [mixedPoint()] }))
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    await store.applyImport()
    expect(disk.points).toEqual([mixedPoint()])
    expect(store.editing).toBe(true)
    store.previewImport(JSON.stringify({ version: 1, points: [{ ...mixedPoint(), stateId: -500 }] }))
    expect(store.error).toContain('未知地图')
    expect(disk.points).toEqual([mixedPoint()])
  })
  it('keeps both form values, coordinates, members and invalid input across repeated tab switches', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    store.addMember(smallEcho.id)
    store.setMemberCount(smallEcho.id, 3)
    store.setMonsterSearch('搜索内容')
    store.setCoordinate('z', 'invalid')
    const echo = store.draft
    store.switchEditorTab('navigation')
    expect(store.editing).toBe(true)
    expect(store.dirty).toBe(false)
    expect(store.hasUnsavedChanges).toBe(true)
    store.setName('未保存的定位点')
    store.setMode('fast-travel')
    store.setCoordinateText('400, 500, 60')
    store.applyCoordinateText()
    store.setTeleportCoordinateText('410, 510, 65')
    store.applyTeleportCoordinateText()
    const navigation = store.draft
    for (let index = 0; index < 3; index += 1) {
      store.switchEditorTab('echo')
      expect(store.draft).toEqual(echo)
      expect(store.coordinateText).toBe('100, 200, 30')
      expect(store.monsterSearch).toBe('搜索内容')
      expect(store.inputErrors.z).toBeTruthy()
      expect(store.inputValues.z).toBe('invalid')
      store.switchEditorTab('navigation')
      expect(store.draft).toEqual(navigation)
      expect(store.teleportCoordinateText).toBe('410, 510, 65')
      expect(store.inputErrors.z).toBeUndefined()
    }
    store.discardChanges()
    expect(store.hasUnsavedChanges).toBe(true)
    store.switchEditorTab('echo')
    expect(store.draft).toEqual(echo)
    store.setCoordinate('z', '30')
    expect(await store.saveAllForms()).toBe(true)
    expect(disk.points).toHaveLength(1)
    expect(store.hasUnsavedChanges).toBe(false)
  })

  it('preserves the hidden form on save and validates it when saving all forms', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    store.addMember(smallEcho.id)
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    store.switchEditorTab('navigation')
    store.setName('待完成定位点')
    store.switchEditorTab('echo')
    expect(await store.savePoint()).toBe(true)
    expect(store.hasUnsavedChanges).toBe(true)
    expect(await store.saveAllForms()).toBe(false)
    expect(store.editorMode).toBe('navigation')
    expect(store.draft).toMatchObject({ name: '待完成定位点' })
    expect(store.inputErrors.x).toBeTruthy()
    store.discardAllForms()
    expect(store.hasUnsavedChanges).toBe(false)
    expect(cache.size).toBe(0)
  })

  it('steps member quantities, caps the maximum, and removes the last member at zero', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    store.addMember(smallEcho.id)
    store.adjustMemberCount(smallEcho.id, 1)
    expect(store.draft?.kind === 'echo' && store.draft.members[0]?.count).toBe(2)
    store.setMemberCount(smallEcho.id, 999)
    store.adjustMemberCount(smallEcho.id, 1)
    expect(store.draft?.kind === 'echo' && store.draft.members[0]?.count).toBe(999)
    store.setMemberCount(smallEcho.id, 2)
    store.adjustMemberCount(smallEcho.id, -1)
    expect(store.draft?.kind === 'echo' && store.draft.members[0]?.count).toBe(1)
    store.adjustMemberCount(smallEcho.id, -1)
    expect(store.draft?.kind === 'echo' && store.draft.members).toEqual([])
    store.adjustMemberCount(smallEcho.id, -1)
    expect(store.inputErrors).toEqual({})
  })

  it('protects hidden edits from imports and keeps both clean forms after importing', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    store.addMember(smallEcho.id)
    const echo = store.draft
    store.switchEditorTab('navigation')
    store.previewImport(JSON.stringify({ version: 1, points: [mixedPoint()] }))
    await store.applyImport()
    expect(saveEditorLibrary).not.toHaveBeenCalled()
    expect(store.error).toContain('两个表单')
    store.switchEditorTab('echo')
    expect(store.draft).toEqual(echo)
    store.discardAllForms()
    const cleanEcho = store.draft
    store.switchEditorTab('navigation')
    const cleanNavigation = store.draft
    await store.applyImport()
    expect(disk.points).toEqual([mixedPoint()])
    expect(store.draft).toEqual(cleanNavigation)
    store.switchEditorTab('echo')
    expect(store.draft).toEqual(cleanEcho)
  })

})

it('preserves independent coordinate buffers across editor tabs and arrival fields', async () => {
  const { editCoordinateInput, switchCoordinateInput } = await import('../src/components/base/coordinate-input.ts')
  const store = usePointEditorStore()
  await store.load('echo')
  const empty = { x: null, y: null, z: null }
  store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '-12,'))
  expect(store.hasUnsavedChanges).toBe(true)
  store.switchEditorTab('navigation')
  store.updateCoordinateInput(false, switchCoordinateInput(store.positionInput, empty, 'axes'))
  store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '-', 'x'))
  store.setPointType('small-beacon')
  store.setMode('fast-travel')
  store.updateCoordinateInput(true, editCoordinateInput(store.arrivalInput, empty, '4,5,'))
  store.switchEditorTab('echo')
  expect(store.positionInput.text).toBe('-12,')
  expect(store.positionInput.mode).toBe('combined')
  store.switchEditorTab('navigation')
  expect(store.positionInput.axes.x).toBe('-')
  expect(store.positionInput.mode).toBe('axes')
  expect(store.arrivalInput.text).toBe('4,5,')
  expect(await store.savePoint()).toBe(false)
  store.discardChanges()
  expect(store.positionInput.axes.x).toBeNull()
})

it('commits combined coordinates when saving without a prior blur', async () => {
  const { editCoordinateInput } = await import('../src/components/base/coordinate-input.ts')
  const store = usePointEditorStore()
  await store.load('echo')
  store.addMember(smallEcho.id)
  store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, { x: null, y: null, z: null }, 'X: -12, Y: 34, Z: 56'))
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]?.coordinate).toEqual({ x: -12, y: 34, z: 56 })
})

it.each(['combined', 'axes', 'save'] as const)('allows clearing an optional arrival using %s input and saves without an arrival override', async (mode) => {
  const { commitCoordinateInput, editCoordinateInput, switchCoordinateInput } = await import('../src/components/base/coordinate-input.ts')
  const store = usePointEditorStore()
  await store.load('navigation')
  store.setPointType('small-beacon')
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  store.setTeleportCoordinateText('4, 5, 6')
  store.applyTeleportCoordinateText()
  expect(await store.savePoint()).toBe(true)
  const arrival = () => store.draft?.kind === 'navigation' ? store.draft.teleportCoordinate ?? { x: null, y: null, z: null } : { x: null, y: null, z: null }
  if (mode === 'axes') {
    store.updateCoordinateInput(true, switchCoordinateInput(store.arrivalInput, arrival(), 'axes', true))
    for (const axis of ['x', 'y', 'z'] as const) {
      store.updateCoordinateInput(true, editCoordinateInput(store.arrivalInput, arrival(), '', axis, true))
      store.updateCoordinateInput(true, commitCoordinateInput(store.arrivalInput, arrival(), true))
      expect(store.arrivalInput.invalid).toBe(false)
    }
  } else {
    store.updateCoordinateInput(true, editCoordinateInput(store.arrivalInput, arrival(), ''))
    if (mode === 'combined') store.updateCoordinateInput(true, commitCoordinateInput(store.arrivalInput, arrival(), true))
  }
  expect(await store.savePoint()).toBe(true)
  expect(store.arrivalInput.invalid).toBe(false)
  expect(store.inputErrors).toEqual({})
  expect(disk.points).toHaveLength(1)
  expect(disk.points[0]).not.toHaveProperty('teleportCoordinate')
  expect(disk.points[0]?.coordinate).toEqual({ x: 1, y: 2, z: 3 })
})

it('clears missing-arrival errors when the optional arrival is emptied after a failed save', async () => {
  const { commitCoordinateInput, editCoordinateInput } = await import('../src/components/base/coordinate-input.ts')
  const store = usePointEditorStore()
  await store.load('navigation')
  store.setPointType('small-beacon')
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  store.setTeleportCoordinate('x', '4')
  expect(await store.savePoint()).toBe(false)
  expect(store.inputErrors['teleport:y']).toBeTruthy()
  expect(store.inputErrors['teleport:z']).toBeTruthy()
  const partial = { x: 4, y: null, z: null }
  store.updateCoordinateInput(true, editCoordinateInput(store.arrivalInput, partial, ''))
  store.updateCoordinateInput(true, commitCoordinateInput(store.arrivalInput, partial, true))
  expect(store.inputErrors).toEqual({})
  expect(store.arrivalInput.invalid).toBe(false)
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).not.toHaveProperty('teleportCoordinate')
})


it('fills a single icon name on selection and still allows editing it afterward', async () => {
  const [first, second] = navigationTypeIcons('service').filter(({ name }) => !name.includes(' / '))
  if (!first || !second) throw new Error('需要图标目录')
  const store = usePointEditorStore()
  await store.load('echo')
  store.switchEditorTab('navigation')
  await store.savePoint()
  expect(store.inputErrors.name).toBeTruthy()
  store.setPointType('service')
  store.setName('')
  await store.savePoint()
  expect(store.inputErrors.name).toBeTruthy()
  store.setIcon(first.id)
  expect(store.draft).toMatchObject({ name: first.name, iconId: first.id })
  expect(store.inputErrors.name).toBeUndefined()
  store.setName('手动名称')
  store.setIcon(second.id)
  expect(store.draft).toMatchObject({ name: second.name })
  store.setIcon(first.id)
  expect(store.draft).toMatchObject({ name: first.name })
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ name: first.name, iconId: first.id })
  store.setName('手动名称')
  expect(store.draft).toMatchObject({ name: '手动名称' })
})

it.each([null, 'service'] as const)('preserves the entered name and name errors when selecting an icon with multiple names for %s', async (pointType) => {
  const shared = navigationTypeIcons(pointType ?? undefined).find(({ name }) => name.includes(' / '))
  if (!shared) throw new Error('需要多名称图标')
  const store = usePointEditorStore()
  await store.load('navigation')
  store.setPointType(pointType)
  store.setName('我记录的服务点')
  store.setIcon(shared.id)
  expect(store.draft).toMatchObject({ name: '我记录的服务点', iconId: shared.id })
  store.setName('')
  await store.savePoint()
  expect(store.inputErrors.name).toBeTruthy()
  store.setIcon(shared.id)
  expect(store.draft).toMatchObject({ name: '', iconId: shared.id })
  expect(store.inputErrors.name).toBeTruthy()
})

it('only selects untyped icons before choosing a type and clears incompatible choices when switching types', async () => {
  const boss = navigationTypeIcons('weekly-boss')[0]
  const beacon = navigationTypeIcons('small-beacon')[0]
  const untyped = navigationTypeIcons(undefined).find(({ name }) => !name.includes(' / '))
  if (!boss || !beacon || !untyped) throw new Error('需要周本、信标和未分类图标')
  const store = usePointEditorStore()
  await store.load('navigation')
  await store.savePoint()
  store.setIcon(boss.id)
  expect(store.draft).not.toHaveProperty('pointType')
  expect(store.draft).not.toHaveProperty('iconId')
  store.setIcon(untyped.id)
  expect(store.draft).toMatchObject({ iconId: untyped.id, name: untyped.name })
  expect(store.inputErrors.icon).toBeUndefined()
  expect(store.inputErrors.name).toBeUndefined()
  store.setIcon('unknown-icon')
  expect(store.draft).toMatchObject({ iconId: untyped.id })
  store.setPointType('weekly-boss')
  expect(store.draft).not.toHaveProperty('iconId')
  store.setIcon(boss.id)
  expect(store.draft).toMatchObject({ iconId: boss.id, name: boss.name })
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ pointType: 'weekly-boss', iconId: boss.id, name: boss.name })
  store.setPointType(null)
  expect(store.draft).not.toHaveProperty('iconId')
  store.setIcon(beacon.id)
  expect(store.draft).not.toHaveProperty('iconId')
  store.setPointType('weekly-boss')
  expect(store.draft).not.toHaveProperty('iconId')
  store.setPointType('small-beacon')
  expect(store.draft).toMatchObject({ iconId: beacon.id, name: '小型信标' })
})

it('locks weekly boss travel and requires an untyped icon after the type is cleared', async () => {
  const store = usePointEditorStore()
  await store.load('echo')
  store.switchEditorTab('navigation')
  store.setPointType('weekly-boss')
  store.setName('测试定位点')
  const icon = navigationTypeIcons('small-beacon')[0]
  if (!icon) throw new Error('缺少信标图标')
  store.setIcon(icon.id)
  expect(store.draft).not.toHaveProperty('iconId')
  expect(store.draft).toMatchObject({ navigationKind: 'boss', mode: 'fast-travel' })
  store.setMode('landmark')
  expect(store.draft).toMatchObject({ mode: 'fast-travel' })
  const boss = navigationTypeIcons('weekly-boss')[0]
  if (!boss) throw new Error('缺少周本图标')
  store.setName('自定义周本名称')
  store.setIcon(boss.id)
  store.setCoordinate('x', '1')
  store.setCoordinate('y', '2')
  store.setCoordinate('z', '3')
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ pointType: 'weekly-boss' })
  store.switchEditorTab('echo')
  store.switchEditorTab('navigation')
  expect(store.draft).toMatchObject({ pointType: 'weekly-boss' })
  store.setPointType('invalid')
  expect(store.draft).toMatchObject({ pointType: 'weekly-boss' })
  store.setTeleportCoordinateText('4, 5, 6')
  store.applyTeleportCoordinateText()
  store.setPointType(null)
  expect(store.draft).toMatchObject({ name: boss.name, mode: 'fast-travel', teleportCoordinate: { x: 4, y: 5, z: 6 } })
  expect(store.draft).not.toHaveProperty('iconId')
  expect(await store.savePoint()).toBe(false)
  const untyped = navigationTypeIcons(undefined)[0]
  if (!untyped) throw new Error('需要未分类图标')
  store.setIcon(untyped.id)
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).not.toHaveProperty('pointType')
  store.setMode('landmark')
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ mode: 'landmark' })
  expect(disk.points[0]).not.toHaveProperty('teleportCoordinate')
})

it.each(['landmark', 'fast-travel'] as const)('saves, reopens, imports and renders an unset type in %s mode with catalogue artwork', async (mode) => {
  const icon = navigationIconById('icon-3dbd69e26723a934')
  if (!icon) throw new Error('需要深塔图标')
  const store = usePointEditorStore()
  await store.load('navigation')
  store.setIcon(icon.id)
  store.setName('自定义点位')
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  store.setMode(mode)
  if (mode === 'fast-travel') {
    store.setTeleportCoordinateText('4, 5, 6')
    store.applyTeleportCoordinateText()
  }
  expect(await store.savePoint()).toBe(true)
  const saved = disk.points[0]
  if (!saved) throw new Error('需要保存的定位点')
  expect(saved).toMatchObject({ name: '自定义点位', iconId: icon.id, navigationKind: 'landmark', mode })
  expect(saved).not.toHaveProperty('pointType')
  setActivePinia(createPinia())
  const reopened = usePointEditorStore()
  await reopened.load('navigation')
  reopened.selectPoint(saved.id)
  expect(reopened.draft).toEqual(saved)
  reopened.previewImport(JSON.stringify(disk))
  expect(reopened.importPreview).toEqual(disk)
  await reopened.applyImport()
  const rendered = libraryLocations(reopened.library, referenceDataset)
  expect(mapDatasetSchema.safeParse({ ...referenceDataset, ...rendered }).success).toBe(true)
  expect(rendered.navigationPoints[0]).toMatchObject({ iconUrl: icon.url, mode })

})

it('resets both editing forms while preserving saved points', async () => {
  const store = usePointEditorStore()
  await store.load('echo')
  store.addMember(smallEcho.id)
  store.setCoordinate('x', '1')
  store.setCoordinate('y', '2')
  store.setCoordinate('z', '3')
  expect(await store.savePoint()).toBe(true)
  const saved = store.library
  store.setCoordinate('x', '9')
  store.switchEditorTab('navigation')
  store.setName('未保存名称')
  expect(store.hasUnsavedChanges).toBe(true)
  store.resetSession()
  expect(store.draft).toBeNull()
  expect(store.hasUnsavedChanges).toBe(false)
  expect(store.library).toBe(saved)
  expect([...cache.keys()].some((key) => key.includes('point-editor:draft'))).toBe(false)
  await store.load('echo')
  expect(store.draft?.coordinate).toEqual({ x: null, y: null, z: null })
  store.switchEditorTab('navigation')
  expect(store.draft).toMatchObject({ name: '', coordinate: { x: null, y: null, z: null } })
})

it('applies every type rule and automatically supplies fixed or candidate artwork', async () => {
  const store = usePointEditorStore()
  await store.load('echo')
  store.switchEditorTab('navigation')
  store.setName('保留的自定义名称')
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  for (const pointType of navigationPointTypeIds) {
    const rule = navigationPointTypes[pointType]
    store.setPointType(null)
    store.setName('保留的自定义名称')
    store.setPointType(pointType)
    expect(store.draft).toMatchObject({ pointType, navigationKind: rule.kind, mode: rule.defaultMode, name: rule.names[0] ?? rule.name, coordinate: { x: 1, y: 2, z: 3 } })
    if (rule.icons.length === 1) {
      const iconId = store.draft?.kind === 'navigation' ? store.draft.iconId : undefined
      expect(navigationTypeIcons(pointType).some(({ id }) => id === iconId)).toBe(true)
    }
    if (rule.teleportLocked) {
      store.setMode('landmark')
      expect(store.draft).toMatchObject({ mode: 'fast-travel' })
    }
  }
})

it('saves, reloads, imports and renders every type without official navigation data or asset loading', async () => {
  const dataset = { ...referenceDataset, navigationPoints: [], navigationPointGroups: [] }
  vi.mocked(loadMapDataset).mockResolvedValue({ dataset, officialLibrary: { version: 1, points: [] } })
  vi.mocked(loadMapAssetCatalog).mockRejectedValue(new Error('官方图标目录已移除'))
  const store = usePointEditorStore()
  await store.load('echo')
  for (const pointType of navigationPointTypeIds) {
    const rule = navigationPointTypes[pointType]
    const icon = navigationTypeIcons(pointType)[0]
    if (!icon) throw new Error(`${rule.name}缺少图标选项`)
    store.newPoint('navigation')
    store.setPointType(pointType)
    store.setIcon(icon.id)
    store.setName(rule.names.at(-1) ?? '独立录入的定位点')
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    expect(await store.savePoint(), `${pointType}: ${store.error}`).toBe(true)
    expect(store.draft).toMatchObject({ pointType, iconId: icon.id, name: rule.names.at(-1) ?? '独立录入的定位点' })
  }
  const saved = parsePointLibrary(JSON.parse(JSON.stringify(disk)), dataset, 'manual')
  expect(saved.points).toHaveLength(navigationPointTypeIds.length)
  setActivePinia(createPinia())
  const reopened = usePointEditorStore()
  await reopened.load('echo')
  for (const point of saved.points) {
    reopened.selectPoint(point.id)
    expect(reopened.draft).toEqual(point)
  }
  reopened.previewImport(JSON.stringify(saved))
  expect(reopened.importPreview).toEqual(saved)
  await reopened.applyImport()
  expect(reopened.error).toBe('')
  expect(disk).toEqual(saved)
  const rendered = libraryLocations(reopened.library, dataset).navigationPoints
  expect(rendered).toHaveLength(saved.points.length)
  for (const point of saved.points) {
    if (point.kind !== 'navigation') throw new Error('应全部为定位点')
    expect(rendered.find(({ id }) => id === point.id)).toMatchObject({
      typeName: point.name, pointType: point.pointType, iconUrl: navigationIconById(point.iconId)?.url,
    })
  }
  expect(loadMapAssetCatalog).not.toHaveBeenCalled()
})

it.each(['central-beacon', 'small-beacon'] as const)('locks the %s name across type changes, saving and reopening', async (pointType) => {
  const store = usePointEditorStore()
  await store.load('echo')
  store.switchEditorTab('navigation')
  store.setPointType('service')
  store.setName('自定义领域')
  expect(store.draft).toMatchObject({ name: '自定义领域' })
  store.setPointType(pointType)
  const expectedName = pointType === 'central-beacon' ? '中枢信标' : '小型信标'
  expect(store.draft).toMatchObject({ name: expectedName })
  store.setName('不能修改')
  store.setName('')
  expect(store.draft).toMatchObject({ name: expectedName })
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  expect(await store.savePoint()).toBe(true)
  const savedId = disk.points[0]?.id
  if (!savedId) throw new Error('需要保存的信标')
  store.closeEditor()
  store.selectPoint(savedId)
  const savedDraft = store.draft
  store.setName('仍然不能修改')
  expect(store.draft).toBe(savedDraft)
  expect(store.dirty).toBe(false)
  store.setPointType(pointType === 'central-beacon' ? 'small-beacon' : 'central-beacon')
  expect(store.draft).toMatchObject({ name: pointType === 'central-beacon' ? '小型信标' : '中枢信标' })
  store.setPointType('service')
  store.setName('可以自定义领域名')
  expect(store.draft).toMatchObject({ name: '可以自定义领域名' })
})

it('supports a type configured as non-teleportable and locked without treating the lock as forced teleport', async () => {
  const original = navigationPointTypes.hologram
  navigationPointTypes.hologram = { ...original, defaultMode: 'landmark', teleportLocked: true }
  try {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('hologram')
    expect(store.draft).toMatchObject({ mode: 'landmark' })
    store.setMode('fast-travel')
    expect(store.draft).toMatchObject({ mode: 'landmark' })
    const icon = navigationTypeIcons('hologram')[0]
    if (!icon) throw new Error('需要全息图标')
    store.setIcon(icon.id)
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    expect(await store.savePoint()).toBe(true)
    const saved = disk.points[0]
    if (!saved) throw new Error('需要已保存的点位')
    expect(saved).toMatchObject({ pointType: 'hologram', mode: 'landmark' })
    expect(() => parsePointLibrary({ version: 1, points: [{ ...saved, mode: 'fast-travel' }] }, referenceDataset)).toThrow('应标记为不可直接传送')
    const locations = libraryLocations(disk, referenceDataset)
    expect(mapDatasetSchema.safeParse({ ...referenceDataset, ...locations }).success).toBe(true)
    const invalid = locations.navigationPoints.map((point) => ({ ...point, mode: 'fast-travel' }))
    expect(mapDatasetSchema.safeParse({ ...referenceDataset, navigationPoints: invalid }).success).toBe(false)
  } finally {
    navigationPointTypes.hologram = original
  }
})

it.each(navigationTypeIcons('hologram'))('allows toggling teleport for $name without changing its icon', async (icon) => {
  const store = usePointEditorStore()
  await store.load('navigation')
  store.setPointType('hologram')
  expect(store.draft).toMatchObject({ mode: 'landmark' })
  store.setIcon(icon.id)
  expect(store.draft).toMatchObject({ name: icon.name })
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ pointType: 'hologram', iconId: icon.id, mode: 'landmark' })
  store.setMode('fast-travel')
  store.setTeleportCoordinateText('4, 5, 6')
  store.applyTeleportCoordinateText()
  expect(await store.savePoint()).toBe(true)
  const savedId = store.draft?.id
  if (!savedId) throw new Error('需要已保存的全息点位')
  store.closeEditor()
  store.selectPoint(savedId)
  expect(store.draft).toMatchObject({ pointType: 'hologram', iconId: icon.id, mode: 'fast-travel', teleportCoordinate: { x: 4, y: 5, z: 6 } })
  store.setMode('landmark')
  expect(store.draft).not.toHaveProperty('teleportCoordinate')
  expect(await store.savePoint()).toBe(true)
  expect(disk.points).toHaveLength(1)
  expect(disk.points[0]).toMatchObject({ name: icon.name, iconId: icon.id, mode: 'landmark' })
  expect(disk.points[0]).not.toHaveProperty('teleportCoordinate')
})

it.each(['normal-boss', 'tacet-field'] as const)('defaults %s to teleport but preserves a saved opt-out when reopening', async (pointType) => {
  const store = usePointEditorStore()
  await store.load('navigation')
  store.setPointType(pointType)
  expect(store.draft).toMatchObject({ mode: 'fast-travel' })
  const icon = navigationTypeIcons(pointType)[0]
  if (!icon) throw new Error('需要定位点图标')
  store.setIcon(icon.id)
  const name = navigationPointTypes[pointType].names[0] ?? '自定义 BOSS'
  store.setName(name)
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  store.setTeleportCoordinateText('4, 5, 6')
  store.applyTeleportCoordinateText()
  expect(await store.savePoint()).toBe(true)
  const savedId = store.draft?.id
  if (!savedId) throw new Error('需要已保存的定位点')
  expect(disk.points[0]).toMatchObject({ mode: 'fast-travel', teleportCoordinate: { x: 4, y: 5, z: 6 } })
  store.setTeleportCoordinate('x', 'bad')
  store.updateCoordinateInput(true, editCoordinateInput(store.arrivalInput, { x: 4, y: 5, z: 6 }, '-'))
  store.setMode('landmark')
  expect(store.draft).toMatchObject({ pointType, name, iconId: icon.id, mode: 'landmark' })
  expect(store.draft).not.toHaveProperty('teleportCoordinate')
  expect(store.inputErrors['teleport:x']).toBeUndefined()
  expect(store.arrivalInput.text).toBeNull()
  expect(store.teleportCoordinateText).toBe('')
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ mode: 'landmark' })
  expect(disk.points[0]).not.toHaveProperty('teleportCoordinate')
  setActivePinia(createPinia())
  const reopened = usePointEditorStore()
  await reopened.load('navigation')
  reopened.selectPoint(savedId)
  expect(reopened.draft).toMatchObject({ pointType, name, iconId: icon.id, mode: 'landmark' })
  reopened.setMode('fast-travel')
  expect(reopened.draft).not.toHaveProperty('teleportCoordinate')
  expect(await reopened.savePoint()).toBe(true)
  expect(disk.points).toHaveLength(1)
  expect(disk.points[0]).toMatchObject({ mode: 'fast-travel' })
})

it('clears arrival coordinates, pending edits and errors when switching to an entrance', async () => {
  const { editCoordinateInput } = await import('../src/components/base/coordinate-input.ts')
  const store = usePointEditorStore()
  await store.load('echo')
  store.switchEditorTab('navigation')
  store.setPointType('small-beacon')
  store.setTeleportCoordinateText('4, 5, 6')
  store.applyTeleportCoordinateText()
  store.setTeleportCoordinate('x', 'bad')
  store.updateCoordinateInput(true, editCoordinateInput(store.arrivalInput, { x: 4, y: 5, z: 6 }, '-'))
  store.setPointType('entrance')
  expect(store.draft).toMatchObject({ name: '入口', mode: 'entrance' })
  expect(store.draft).not.toHaveProperty('teleportCoordinate')
  expect(store.inputErrors['teleport:x']).toBeUndefined()
  expect(store.arrivalInput.text).toBeNull()
  expect(store.teleportCoordinateText).toBe('')
  store.setTeleportCoordinate('x', '99')
  expect(store.draft).not.toHaveProperty('teleportCoordinate')
  store.setMode('fast-travel')
  store.setTeleportCoordinateText('7, 8, 9')
  store.applyTeleportCoordinateText()
  expect(store.draft).toMatchObject({ mode: 'fast-travel', teleportCoordinate: { x: 7, y: 8, z: 9 } })
  store.setMode('landmark')
  expect(store.draft).toMatchObject({ mode: 'entrance' })
  expect(store.draft).not.toHaveProperty('teleportCoordinate')
})

it('switches ordinary and nightmare boss icons within one type and saves the selection', async () => {
  const store = usePointEditorStore()
  await store.load('echo')
  store.switchEditorTab('navigation')
  store.setPointType('normal-boss')
  const ordinary = navigationTypeIcons('normal-boss').slice(0, 2)
  const nightmare = navigationTypeIcons('normal-boss').find(({ name }) => name.startsWith('梦魇'))
  if (!ordinary[0] || !ordinary[1] || !nightmare) throw new Error('需要普通和梦魇首领')
  store.setName('无冠者')
  store.setIcon(ordinary[0].id)
  expect(store.draft).toMatchObject({ name: '无冠者' })
  store.setIcon(ordinary[1].id)
  expect(store.draft).toMatchObject({ name: ordinary[1].name })
  store.setName('无冠者')
  store.setIcon(nightmare.id)
  expect(store.draft).toMatchObject({ pointType: 'normal-boss', name: nightmare.name, mode: 'fast-travel' })
  expect(store.draft).not.toHaveProperty('variant')
  expect(store.draft).toMatchObject({ iconId: nightmare.id })
  store.setMode('landmark')
  expect(store.draft).toMatchObject({ mode: 'landmark' })
  store.setIcon(ordinary[0].id)
  expect(store.draft).toMatchObject({ iconId: ordinary[0].id })
  store.setIcon(nightmare.id)
  store.setName('梦魇·无冠者')
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ pointType: 'normal-boss', name: '梦魇·无冠者' })
  expect(disk.points[0]).not.toHaveProperty('variant')
  store.setPointType('normal-boss')
  store.setIcon(nightmare.id)
  expect(store.draft).toMatchObject({ iconId: nightmare.id, name: nightmare.name })
  store.setPointType('service')
  store.setName('独立名称')
  expect(store.draft).not.toHaveProperty('variant')
  expect(store.draft).toMatchObject({ name: '独立名称', mode: 'fast-travel' })
})

it('defaults exploration quests to non-teleport with their shared icon and preserves custom names on reload', async () => {
  const store = usePointEditorStore()
  await store.load('echo')
  store.switchEditorTab('navigation')
  store.setPointType('small-beacon')
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  store.setPointType('exploration-quest')
  expect(store.draft).toMatchObject({
    pointType: 'exploration-quest', navigationKind: 'landmark', mode: 'landmark',
    name: '危行任务', iconId: 'icon-05f43f9613d478b8',
  })
  expect(navigationTypeIcons('exploration-quest')).toHaveLength(1)
  for (const name of ['三重冠塔', '残息海岸']) {
    store.setName(name)
    expect(await store.savePoint()).toBe(true)
    const saved = disk.points[0]
    if (!saved) throw new Error('需要保存的危行任务点')
    store.newPoint('navigation')
    store.selectPoint(saved.id)
    expect(store.draft).toMatchObject({
      pointType: 'exploration-quest', mode: 'landmark', name, iconId: 'icon-05f43f9613d478b8',
    })
  }
})

it('defaults services to fast travel and preserves a manual opt-out when selecting an icon', async () => {
  const store = usePointEditorStore()
  await store.load('echo')
  const service = navigationTypeIcons('service')[0]
  if (!service) throw new Error('需要服务点')
  store.setReferenceData({ ...referenceDataset, navigationPoints: [], navigationPointGroups: [] }, { version: 1, points: [] })
  store.switchEditorTab('navigation')
  store.setPointType('service')
  expect(store.draft).toMatchObject({ pointType: 'service', mode: 'fast-travel' })
  store.setMode('landmark')
  store.setIcon(service.id)
  expect(store.draft).toMatchObject({ pointType: 'service', navigationKind: 'service', mode: 'landmark', iconId: service.id })
  store.setMode('fast-travel')
  expect(store.draft).toMatchObject({ mode: 'fast-travel' })
})


it('allows free names with fixed and selectable icons, including settlements absent from the official data', async () => {
  const store = usePointEditorStore()
  await store.load('echo')
  store.switchEditorTab('navigation')
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  store.setPointType('material-domain')
  const fixedIcon = store.draft?.kind === 'navigation' ? store.draft.iconId : undefined
  expect(fixedIcon).toBeTruthy()
  store.setName('')
  expect(await store.savePoint()).toBe(false)
  expect(store.inputErrors.name).toBeTruthy()
  store.setName('未收录的领域')
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ name: '未收录的领域', iconId: fixedIcon })
  store.setName('山北的材料本')
  expect(store.draft).toMatchObject({ name: '山北的材料本', iconId: fixedIcon })

  store.setPointType('echo-settlement')
  expect(store.draft).not.toHaveProperty('iconId')
  const options = navigationTypeIcons('echo-settlement')
  if (!options[0] || !options[1]) throw new Error('需要两个不同的聚落图标')
  store.setIcon(options[0].id)
  expect(store.draft).toMatchObject({ name: options[0].name, iconId: options[0].id })
  store.setIcon(options[1].id)
  expect(store.draft).toMatchObject({ name: options[0].name, iconId: options[1].id })
  store.setName('我记录的山脚聚落')
  expect(store.draft).toMatchObject({ name: '我记录的山脚聚落', iconId: options[1].id })
  const selected = store.draft
  if (fixedIcon) store.setIcon(fixedIcon)
  expect(store.draft).toBe(selected)
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ name: '我记录的山脚聚落', pointType: 'echo-settlement', iconId: options[1].id })
  const savedId = disk.points[0]?.id
  if (!savedId) throw new Error('需要保存的聚落')
  store.newPoint('navigation')
  store.selectPoint(savedId)
  expect(store.draft).toMatchObject({ name: '我记录的山脚聚落', pointType: 'echo-settlement' })
  store.previewImport(JSON.stringify(disk))
  expect(store.importPreview?.points[0]).toMatchObject({ name: '我记录的山脚聚落' })
})

it('reuses main-map data and the loaded library when reopening the editor', async () => {
  const store = usePointEditorStore()
  store.setReferenceData(referenceDataset, { version: 1, points: [] })
  await store.load('echo')
  expect(loadMapDataset).not.toHaveBeenCalled()
  expect(readEditorLibrary).toHaveBeenCalledTimes(1)
  store.addMember(smallEcho.id)
  store.resetSession()
  await store.load('echo')
  expect(loadMapDataset).not.toHaveBeenCalled()
  expect(readEditorLibrary).toHaveBeenCalledTimes(1)
  expect(store.draft).toMatchObject({ members: [], coordinate: { x: null, y: null, z: null } })
  expect(store.busy).toBe(false)
})

it('allows retry after the initial editor library load fails', async () => {
  const store = usePointEditorStore()
  store.setReferenceData(referenceDataset, { version: 1, points: [] })
  vi.mocked(readEditorLibrary).mockRejectedValueOnce(new Error('暂时不可用'))
  await store.load('echo')
  expect(store.error).toBe('暂时不可用')
  await store.load('echo')
  expect(readEditorLibrary).toHaveBeenCalledTimes(2)
  expect(store.error).toBe('')
})

it('persists the last thirty distinct icon selections across new points and reloads', async () => {
  const store = usePointEditorStore()
  await store.load('navigation')
  const icons = navigationTypeIcons(undefined).slice(0, 32)
  for (const icon of icons) store.setIcon(icon.id)
  expect(store.recentIconIds).toEqual(icons.slice(2).reverse().map(({ id }) => id))
  const reused = icons[4]
  if (!reused) throw new Error('需要图标')
  store.setIcon(reused.id)
  const expected = [reused.id, ...icons.slice(2).reverse().filter(({ id }) => id !== reused.id).map(({ id }) => id)]
  expect(store.recentIconIds).toEqual(expected)
  store.setIcon('unknown-icon')
  store.newPoint()
  expect(store.recentIconIds).toEqual(expected)
  setActivePinia(createPinia())
  const reopened = usePointEditorStore()
  await reopened.load('navigation')
  expect(reopened.recentIconIds).toEqual(expected)
})

it('updates the name with fixed artwork on type changes but preserves edits when reselecting the same type', async () => {
  const store = usePointEditorStore()
  await store.load('navigation')
  store.setPointType('service')
  store.setName('旧服务名称')
  store.setPointType('material-domain')
  expect(store.draft).toMatchObject({ name: '材料副本', iconId: navigationPointTypes['material-domain'].icons[0] })
  store.setName('自定义材料本')
  store.setPointType('material-domain')
  expect(store.draft).toMatchObject({ name: '自定义材料本' })
  store.setPointType('entrance')
  expect(store.draft).toMatchObject({ name: '入口', iconId: navigationPointTypes.entrance.icons[0] })
})

it('restores only thirty distinct known icon IDs from local preferences', async () => {
  const ids = navigationTypeIcons(undefined).slice(0, 32).map(({ id }) => id)
  cache.set('echo-map:point-editor:recent-icons:v1', JSON.stringify([null, 12, 'unknown', ids[0], ...ids]))
  const store = usePointEditorStore()
  await store.load('navigation')
  expect(store.recentIconIds).toEqual(ids.slice(0, 30))
})

it.each(['invalid-json', '{}', 'null'])('ignores malformed recent icon preferences: %s', async (saved) => {
  cache.set('echo-map:point-editor:recent-icons:v1', saved)
  const store = usePointEditorStore()
  await store.load('navigation')
  expect(store.recentIconIds).toEqual([])
  expect(store.error).toBe('')
})

it('keeps icon selection usable when local storage is unavailable', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('Storage unavailable') },
    setItem: () => { throw new Error('Storage unavailable') },
  })
  const store = usePointEditorStore()
  await store.load('navigation')
  const icon = navigationTypeIcons(undefined)[0]
  if (!icon) throw new Error('需要图标')
  store.setIcon(icon.id)
  expect(store.draft).toMatchObject({ iconId: icon.id })
  await store.load('navigation')
  expect(store.recentIconIds).toEqual([icon.id])
  expect(store.error).toBe('')
})
