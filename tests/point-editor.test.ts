import { createPinia, setActivePinia } from 'pinia'
import { nextTick, watchEffect } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePointEditorStore } from '../src/stores/point-editor.ts'
import { loadMapAssetCatalog, loadMapDataset } from '../src/data/load.ts'
import { readEditorLibrary, saveEditorLibrary } from '../src/data/editor-client.ts'
import { referenceDataset, mixedPoint, smallEcho, eliteEcho } from './fixtures/point-library.ts'
import type { MapStateDefinition, PointLibrary } from '../src/domain/types.ts'
import { commitCoordinateInput, editCoordinateInput, emptyCoordinateInput } from '../src/components/base/coordinate-input.ts'
import { navigationPointTypeIds, navigationPointTypes } from '../src/domain/navigation-point-types.ts'
import { navigationIconById, navigationTypeIcons } from '../src/domain/navigation-icons.ts'
import { editorLibraryLocations, libraryLocations, parsePointLibrary } from '../src/domain/point-library.ts'
import { mapDatasetSchema } from '../src/domain/schema.ts'

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

describe('point editor actions', () => {
  it.each(['navigation', 'echo'] as const)('offers floors covering the %s position and preserves the selection through saving and reopening', async (kind) => {
    const dataset = floorEditorDataset()
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset, officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load(kind)
    expect(store.availableFloors).toEqual([])
    expect(store.pointLevelId).toBeNull()
    const empty = store.draft
    store.setLevel('a1')
    expect(store.draft).toBe(empty)
    store.setCoordinateText('100, 100, 20')
    store.applyCoordinateText()
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2'])
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
    expect(reopened.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2'])
    expect(reopened.dirty).toBe(false)
    reopened.setLevel(null)
    expect(reopened.pointLevelId).toBeNull()
    expect(await reopened.savePoint()).toBe(true)
    expect(disk.points[0]?.levelId).toBeNull()
  })

  it('derives floor options from the latest XY buffer without requiring Z or using arrival coordinates', async () => {
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset: floorEditorDataset(), officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('small-beacon')
    const empty = { x: null, y: null, z: null }
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '100, 100'))
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2'])
    store.setLevel('a2')
    expect(store.pointLevelId).toBe('a2')
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '100, 600'))
    expect(store.availableFloors).toEqual([])
    expect(store.pointLevelId).toBeNull()
    expect(store.draft?.levelId).toBeNull()
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '600, 600'))
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['b1'])
    store.setLevel('b1')
    store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '600,'))
    expect(store.availableFloors).toEqual([])
    expect(store.pointLevelId).toBeNull()
    const full = editCoordinateInput(store.positionInput, empty, '600, 600, 20')
    store.updateCoordinateInput(false, commitCoordinateInput(full.state, full.value))
    expect(store.pointLevelId).toBe('b1')
    store.setTeleportCoordinateText('10000, 10000, 50')
    store.applyTeleportCoordinateText()
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['b1'])
    expect(store.pointLevelId).toBe('b1')
  })

  it('returns to the base map when coordinate edits leave the selected floor and rejects unrelated floors', async () => {
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset: floorEditorDataset(), officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load('navigation')
    store.initializeMapContext({ stateId: 8, levelId: 'a2' })
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
    store.setCoordinateText('100, 600, 20')
    store.applyCoordinateText()
    expect(store.availableFloors).toEqual([])
    expect(store.pointLevelId).toBeNull()
    expect(store.draft?.levelId).toBeNull()
    store.setCoordinateText('100, 100, 20')
    store.applyCoordinateText()
    expect(store.availableFloors.map(({ id }) => id)).toEqual(['a1', 'a2'])
    expect(store.pointLevelId).toBeNull()
    store.selectState(900)
    expect(store.availableFloors).toEqual([])
    expect(store.pointLevelId).toBeNull()
  })

  it('remembers the four most recently saved navigation types across sessions and reloads', async () => {
    cache.set('echo-map:point-editor:recent-types:v1', '["shop"]')
    const store = usePointEditorStore()
    await store.load('navigation')
    expect(store.recentPointTypes).toEqual([])
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    for (const type of ['central-beacon', 'small-beacon', 'material-domain', 'tacet-field', 'nightmare-settlement']) {
      const previous = store.recentPointTypes
      store.setPointType(type)
      expect(store.recentPointTypes).toBe(previous)
      expect(await store.savePoint()).toBe(true)
    }
    expect(store.recentPointTypes).toEqual(['nightmare-settlement', 'tacet-field', 'material-domain', 'small-beacon'])
    const previous = store.recentPointTypes
    store.setPointType('tacet-field')
    expect(await store.savePoint()).toBe(true)
    expect(previous).toEqual(['nightmare-settlement', 'tacet-field', 'material-domain', 'small-beacon'])
    const expected = ['tacet-field', 'nightmare-settlement', 'material-domain', 'small-beacon']
    expect(store.recentPointTypes).toEqual(expected)
    store.setPointType('hologram')
    store.setPointType(null)
    store.setPointType('not-a-type')
    store.switchEditorTab('echo')
    store.setPointType('shop')
    expect(store.recentPointTypes).toEqual(expected)
    expect(loadMapAssetCatalog).not.toHaveBeenCalled()

    store.resetSession()
    await store.load('navigation')
    expect(store.recentPointTypes).toEqual(expected)
    expect(store.dirty).toBe(false)
    setActivePinia(createPinia())
    const restored = usePointEditorStore()
    await restored.load('navigation')
    expect(restored.recentPointTypes).toEqual(expected)
    expect(restored.dirty).toBe(false)
  })

  it('updates recent types only after a successful save, excluding unset types and echoes', async () => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setPointType('small-beacon')
    expect(await store.savePoint()).toBe(false)
    expect(store.recentPointTypes).toEqual([])
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    const response = Promise.withResolvers<Awaited<ReturnType<typeof saveEditorLibrary>>>()
    vi.mocked(saveEditorLibrary).mockReturnValueOnce(response.promise)
    const saving = store.savePoint()
    expect(store.recentPointTypes).toEqual([])
    expect(cache.has('echo-map:point-editor:recent-saved-types:v1')).toBe(false)
    const library = vi.mocked(saveEditorLibrary).mock.calls.at(-1)?.[0]
    if (!library) throw new Error('Missing saved library')
    response.resolve({ library, revision: '2', storage: 'project' })
    expect(await saving).toBe(true)
    expect(store.recentPointTypes).toEqual(['small-beacon'])

    store.setPointType('central-beacon')
    vi.mocked(saveEditorLibrary).mockRejectedValueOnce(new Error('保存失败'))
    expect(await store.savePoint()).toBe(false)
    expect(store.recentPointTypes).toEqual(['small-beacon'])
    store.setPointType(null)
    expect(await store.savePoint()).toBe(true)
    expect(store.recentPointTypes).toEqual(['small-beacon'])
    store.switchEditorTab('echo')
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    store.addMember(smallEcho.id)
    expect(await store.savePoint()).toBe(true)
    expect(store.recentPointTypes).toEqual(['small-beacon'])
  })

  it('restores no more than four distinct saved types', async () => {
    cache.set('echo-map:point-editor:recent-saved-types:v1', JSON.stringify([
      'small-beacon', 'central-beacon', 'small-beacon', 'tacet-field', 'material-domain', 'shop',
    ]))
    const store = usePointEditorStore()
    await store.load('navigation')
    expect(store.recentPointTypes).toEqual(['small-beacon', 'central-beacon', 'tacet-field', 'material-domain'])
  })

  it.each(['invalid-json', 'null', '{}', '["not-a-type"]'])('ignores invalid recent navigation type storage: %s', async (cached) => {
    cache.set('echo-map:point-editor:recent-saved-types:v1', cached)
    const store = usePointEditorStore()
    await store.load('navigation')
    expect(store.recentPointTypes).toEqual([])
    expect(store.error).toBe('')
    store.setPointType('small-beacon')
    expect(store.recentPointTypes).toEqual([])
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    expect(await store.savePoint()).toBe(true)
    expect(store.recentPointTypes).toEqual(['small-beacon'])
  })

  it('keeps recent types usable when their browser storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (key.includes(':recent-saved-types:')) throw new Error('Storage unavailable')
        return cache.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (key.includes(':recent-saved-types:')) throw new Error('Storage unavailable')
        cache.set(key, value)
      },
      removeItem: (key: string) => cache.delete(key),
    })
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    store.setPointType('small-beacon')
    expect(await store.savePoint()).toBe(true)
    store.setPointType('central-beacon')
    expect(await store.savePoint()).toBe(true)
    store.resetSession()
    await store.load('navigation')
    expect(store.recentPointTypes).toEqual(['central-beacon', 'small-beacon'])
    expect(store.error).toBe('')
    expect(store.notice).toBe('')
  })

  it('keeps echoes hidden throughout the initial navigation session and a cached reopen', async () => {
    const store = usePointEditorStore()
    store.setReferenceData(referenceDataset, { version: 1, points: [{
      ...mixedPoint('official:source'), status: 'imported', officialIds: ['source'], coordinate: { x: 1, y: 2, z: 0 },
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

  it('exposes the current operation and clears loading after saves, deletions, undo, and imports', async () => {
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
    const undoing = store.undoDelete()
    expect(store.operation).toBe('undo')
    await undoing
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
    store.initializeMapContext({ stateId: countryState.id, countryId: country.countryId })
    expect(store.draft).toMatchObject({
      stateId: countryState.id,
      countryId: country.countryId,
      levelId: null,
    })
    store.initializeMapContext({ stateId: floorState.id, levelId: floor.id })
    expect(store.draft).toMatchObject({
      stateId: floorState.id,
      countryId: null,
      levelId: floor.id,
    })
    store.initializeMapContext({ stateId: gravityState.id, gravityType: 2 })
    expect(store.draft).toMatchObject({
      stateId: gravityState.id,
      countryId: null,
      levelId: null,
      gravityType: 2,
    })
    expect(store.dirty).toBe(false)

    store.initializeMapContext({ stateId: -1, countryId: -1, levelId: 'unknown', gravityType: 2 })
    expect(store.draft).toMatchObject({ stateId: gravityState.id, countryId: null, levelId: null, gravityType: 2 })
    expect(store.dirty).toBe(false)
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
    expect(await store.savePoint()).toBe(true)
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
      expect(await store.savePoint()).toBe(true)
      expect(store.draft?.id).toBe(id)
      store.newPoint()
      expect(store.draft?.id).not.toBe(id)
      expect(store.draft).toMatchObject({ kind, status: 'draft', coordinate: { x: null, y: null, z: null } })
      expect(store.dirty).toBe(false)
    }
    expect(disk.points).toHaveLength(2)
    expect(new Set(disk.points.map(({ id }) => id)).size).toBe(2)
    expect(disk.points.map(({ coordinate }) => coordinate.x)).toEqual([10, 20])

    const first = disk.points[0]
    if (!first) throw new Error('需要已保存点位')
    store.selectPoint(first.id)
    store.setCoordinate('x', '11')
    expect(await store.savePoint()).toBe(true)
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
      expect(await store.savePoint()).toBe(true)
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

  it.each(['central-beacon', 'small-beacon', 'material-domain'] as const)('continues adding %s with only its type defaults and map context', async (pointType) => {
    const dataset = floorEditorDataset()
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset, officialLibrary: { version: 1, points: [] } })
    const store = usePointEditorStore()
    await store.load('navigation')
    expect(store.continueAdding).toBe(false)
    expect(store.canContinueAdding).toBe(true)
    const state = dataset.states.find(({ id }) => id === 8)
    const floor = state?.layeredMaps.flatMap(({ floors }) => floors)[0]
    if (!state || !floor) throw new Error('需要分层地图')
    store.initializeMapContext({ stateId: state.id, levelId: floor.id })
    store.setContinueAdding(true)
    store.setPointType(pointType)
    const rule = navigationPointTypes[pointType]
    for (const x of [10, 20]) {
      store.setCoordinateText(`${x}, 2, 3`)
      store.applyCoordinateText()
      store.setTeleportCoordinateText(`${x + 1}, 2, 3`)
      store.applyTeleportCoordinateText()
      store.setNote('仅当前点位的备注')
      if (!rule.names.length) store.setName('仅当前材料副本的名称')
      const savedId = store.draft?.id
      expect(await store.savePoint()).toBe(true)
      expect(disk.points.find(({ id }) => id === savedId)).toMatchObject({
        status: 'verified', pointType, coordinate: { x, y: 2, z: 3 }, teleportCoordinate: { x: x + 1, y: 2, z: 3 },
      })
      expect(store.draft?.id).not.toBe(savedId)
      expect(store.draft).toMatchObject({
        kind: 'navigation', status: 'draft', pointType, name: rule.names[0] ?? '', iconId: rule.icons[0],
        mode: rule.defaultMode, stateId: state.id, levelId: floor.id, note: '', coordinate: { x: null, y: null, z: null },
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
      expect(store.recentPointTypes).toEqual([pointType])
      expect([...cache.keys()].some((key) => key.includes('point-editor:draft'))).toBe(false)
    }
    expect(disk.points).toHaveLength(2)
    expect(new Set(disk.points.map(({ id }) => id)).size).toBe(2)
    store.resetSession()
    expect(store.continueAdding).toBe(true)
    await store.load('navigation')
    expect(store.continueAdding).toBe(true)
  })

  it.each(['weekly-boss', 'hologram', null] as const)('does not copy custom names, artwork or teleport choices when continuing %s', async (pointType) => {
    const store = usePointEditorStore()
    await store.load('navigation')
    store.setContinueAdding(true)
    store.setPointType(pointType)
    if (pointType) {
      const icon = navigationTypeIcons(pointType)[0]
      if (!icon) throw new Error('需要候选图标')
      store.setIcon(icon.id)
    } else store.setIconUrl('https://example.com/custom.png')
    store.setName('当前点位的自定义名称')
    store.setMode('fast-travel')
    store.setCoordinateText('1, 2, 3')
    store.applyCoordinateText()
    expect(await store.savePoint()).toBe(true)
    expect(store.draft).toMatchObject({
      name: '', mode: pointType ? navigationPointTypes[pointType].defaultMode : 'landmark', coordinate: { x: null, y: null, z: null },
    })
    expect(store.draft).not.toHaveProperty('iconId')
    expect(store.draft).not.toHaveProperty('iconUrl')
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
    expect(store.recentPointTypes).toEqual([])
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
    expect(store.draft?.status).toBe('verified')
    expect(store.hasUnsavedChanges).toBe(false)
    expect(disk.points).toHaveLength(1)
  })

  it('keeps official points read-only without replacing or discarding either editing form', async () => {
    const official = { ...mixedPoint('official:one'), status: 'imported' as const, officialIds: ['one', 'two'], coordinate: { x: -497, y: 449, z: 0 } }
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
    expect(store.draft).toBe(echoDraft)
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
    store.setPointType('synthesizer')
    expect(store.inputErrors['teleport:x']).toBeUndefined()
    expect(await store.savePoint()).toBe(true)
  })

  it('keeps failed saves and recovers either point kind from the automatic cache', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    store.newPoint('navigation')
    store.setName('未完成的定位点')
    setActivePinia(createPinia())
    const reopened = usePointEditorStore()
    await reopened.load('echo')
    reopened.switchEditorTab('navigation')
    expect(reopened.recovery).toMatchObject({ kind: 'navigation', name: '未完成的定位点' })
    reopened.recoverDraft()
    expect(reopened.editing).toBe(true)
    expect(reopened.dirty).toBe(true)
    reopened.discardChanges()
    reopened.newPoint('echo')
    reopened.addMember(smallEcho.id)
    reopened.setCoordinateText('100, 200, 30')
    reopened.applyCoordinateText()
    vi.mocked(saveEditorLibrary).mockRejectedValueOnce(new Error('文件写入失败'))
    expect(await reopened.savePoint()).toBe(false)
    expect(reopened.error).toBe('文件写入失败')
    expect(reopened.dirty).toBe(true)
    expect(cache.size).toBe(1)
    expect(disk.points).toEqual([])
  })

  it('opens the form immediately and preserves context when creating the next point', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    store.selectState(903)
    store.selectGravity(2)
    expect(store.dirty).toBe(true)
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    store.addMember(smallEcho.id)
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]?.gravityType).toBe(2)
    store.closeEditor()
    expect(store.editing).toBe(true)
    store.newPoint('navigation')
    expect(store.draft).toMatchObject({ stateId: 903, gravityType: 2, coordinate: { x: null, y: null, z: null } })
    store.selectState(8)
    expect(store.draft?.gravityType).toBeNull()
  })

  it('deletes and restores a point without losing its data', async () => {
    disk = { version: 1, points: [mixedPoint()] }
    const store = usePointEditorStore()
    await store.load('echo')
    store.selectPoint('mixed-point')
    await store.deletePoint()
    expect(disk.points).toEqual([])
    expect(store.editing).toBe(true)
    await store.undoDelete()
    expect(disk.points).toEqual([mixedPoint()])
    expect(store.editing).toBe(true)
    expect(store.deleted).toBeNull()
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
  it('keeps both form references, coordinates, members and invalid input across repeated tab switches', async () => {
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
      expect(store.draft).toBe(echo)
      expect(store.coordinateText).toBe('100, 200, 30')
      expect(store.monsterSearch).toBe('搜索内容')
      expect(store.inputErrors.z).toBeTruthy()
      expect(store.inputValues.z).toBe('invalid')
      store.switchEditorTab('navigation')
      expect(store.draft).toBe(navigation)
      expect(store.teleportCoordinateText).toBe('410, 510, 65')
      expect(store.inputErrors.z).toBeUndefined()
    }
    store.discardChanges()
    expect(store.hasUnsavedChanges).toBe(true)
    store.switchEditorTab('echo')
    expect(store.draft).toBe(echo)
    store.setCoordinate('z', '30')
    expect(await store.saveAllForms()).toBe(true)
    expect(disk.points).toHaveLength(1)
    expect(store.hasUnsavedChanges).toBe(false)
  })

  it('recovers both cached tabs independently and never clears the hidden draft on save', async () => {
    const store = usePointEditorStore()
    await store.load('echo')
    store.addMember(smallEcho.id)
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    store.switchEditorTab('navigation')
    store.setName('待完成定位点')
    expect(cache.size).toBe(2)
    store.switchEditorTab('echo')
    expect(await store.savePoint()).toBe(true)
    expect(cache.size).toBe(1)
    expect(store.hasUnsavedChanges).toBe(true)
    setActivePinia(createPinia())
    const reopened = usePointEditorStore()
    await reopened.load('echo')
    reopened.switchEditorTab('navigation')
    expect(reopened.recovery).toMatchObject({ name: '待完成定位点' })
    reopened.recoverDraft()
    expect(reopened.draft).toMatchObject({ name: '待完成定位点' })
    reopened.switchEditorTab('echo')
    expect(await reopened.saveAllForms()).toBe(false)
    expect(reopened.editorMode).toBe('navigation')
    expect(reopened.inputErrors.x).toBeTruthy()
    reopened.discardAllForms()
    expect(reopened.hasUnsavedChanges).toBe(false)
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
    expect(store.draft).toBe(echo)
    store.discardAllForms()
    const cleanEcho = store.draft
    store.switchEditorTab('navigation')
    const cleanNavigation = store.draft
    await store.applyImport()
    expect(disk.points).toEqual([mixedPoint()])
    expect(store.draft).toBe(cleanNavigation)
    store.switchEditorTab('echo')
    expect(store.draft).toBe(cleanEcho)
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
  const [first, second] = navigationTypeIcons('service')
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
  const shared = navigationTypeIcons('service').find(({ name }) => name.includes(' / '))
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

it('selects icons before choosing a type and keeps compatible choices when setting or clearing the type', async () => {
  const boss = navigationTypeIcons('weekly-boss')[0]
  const beacon = navigationTypeIcons('small-beacon')[0]
  if (!boss || !beacon) throw new Error('需要周本和信标图标')
  const store = usePointEditorStore()
  await store.load('navigation')
  await store.savePoint()
  store.setIcon(boss.id)
  expect(store.draft).not.toHaveProperty('pointType')
  expect(store.draft).toMatchObject({ iconId: boss.id, name: boss.name })
  expect(store.inputErrors.icon).toBeUndefined()
  expect(store.inputErrors.name).toBeUndefined()
  store.setIcon('unknown-icon')
  expect(store.draft).toMatchObject({ iconId: boss.id })
  store.setPointType('weekly-boss')
  expect(store.draft).toMatchObject({ iconId: boss.id, name: boss.name })
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ pointType: 'weekly-boss', iconId: boss.id, name: boss.name })
  store.setPointType(null)
  expect(store.draft).toMatchObject({ iconId: boss.id })
  store.setIcon(beacon.id)
  expect(store.draft).toMatchObject({ iconId: beacon.id, name: beacon.name })
  store.setPointType('weekly-boss')
  expect(store.draft).not.toHaveProperty('iconId')
  store.setPointType('small-beacon')
  expect(store.draft).toMatchObject({ iconId: beacon.id, name: '小型信标' })
})

it('locks weekly boss travel and rejects unrelated icons until the type is cleared', async () => {
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
  expect(store.draft).toMatchObject({ name: boss.name, iconId: boss.id, mode: 'fast-travel', teleportCoordinate: { x: 4, y: 5, z: 6 } })
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).not.toHaveProperty('pointType')
  store.setMode('landmark')
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ mode: 'landmark' })
  expect(disk.points[0]).not.toHaveProperty('teleportCoordinate')
})

it.each(['landmark', 'fast-travel'] as const)('saves, reopens, imports and renders an unset type in %s mode with catalogue or custom artwork', async (mode) => {
  const icon = navigationTypeIcons('tower-of-adversity')[0]
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
  reopened.selectPoint(saved.id)
  reopened.setIconUrl('https://example.com/custom-point.png')
  expect(await reopened.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ iconUrl: 'https://example.com/custom-point.png', mode })
  expect(disk.points[0]).not.toHaveProperty('iconId')
  expect(disk.points[0]).not.toHaveProperty('pointType')
  expect(parsePointLibrary(JSON.parse(JSON.stringify(disk)), referenceDataset)).toEqual(disk)
})

it('resets both editing forms and recovery caches while preserving saved points', async () => {
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
    expect(store.draft).toMatchObject({ pointType, navigationKind: rule.kind, mode: rule.defaultMode, name: rule.names[0] ?? '保留的自定义名称', coordinate: { x: 1, y: 2, z: 3 } })
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

it.each(['normal-boss', 'nightmare-boss', 'tacet-field'] as const)('defaults %s to teleport but preserves a saved opt-out when reopening', async (pointType) => {
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

it('clears arrival coordinates, pending edits and errors when switching to local traffic', async () => {
  const { editCoordinateInput } = await import('../src/components/base/coordinate-input.ts')
  const store = usePointEditorStore()
  await store.load('echo')
  store.switchEditorTab('navigation')
  store.setPointType('small-beacon')
  store.setTeleportCoordinateText('4, 5, 6')
  store.applyTeleportCoordinateText()
  store.setTeleportCoordinate('x', 'bad')
  store.updateCoordinateInput(true, editCoordinateInput(store.arrivalInput, { x: 4, y: 5, z: 6 }, '-'))
  store.setPointType('gondola')
  expect(store.draft).toMatchObject({ name: '贡多拉站台', mode: 'local-transit' })
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
  expect(store.draft).toMatchObject({ mode: 'local-transit' })
  expect(store.draft).not.toHaveProperty('teleportCoordinate')
})

it('switches nightmare bosses through the type selector and preserves the custom name', async () => {
  const store = usePointEditorStore()
  await store.load('echo')
  store.switchEditorTab('navigation')
  store.setPointType('normal-boss')
  const ordinary = navigationTypeIcons('normal-boss').slice(0, 2)
  const nightmare = navigationTypeIcons('nightmare-boss')[0]
  if (!ordinary[0] || !ordinary[1] || !nightmare) throw new Error('需要普通和梦魇首领')
  store.setName('无冠者')
  store.setIcon(ordinary[0].id)
  expect(store.draft).toMatchObject({ name: '无冠者' })
  store.setIcon(ordinary[1].id)
  expect(store.draft).toMatchObject({ name: ordinary[1].name })
  store.setName('无冠者')
  store.setPointType('nightmare-boss')
  expect(store.draft).toMatchObject({ pointType: 'nightmare-boss', name: '无冠者', mode: 'fast-travel' })
  expect(store.draft).not.toHaveProperty('variant')
  expect(store.draft).not.toHaveProperty('iconId')
  store.setMode('landmark')
  expect(store.draft).toMatchObject({ mode: 'landmark' })
  store.setIcon(ordinary[0].id)
  expect(store.draft).not.toHaveProperty('iconId')
  store.setIcon(nightmare.id)
  store.setName('梦魇·无冠者')
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ pointType: 'nightmare-boss', name: '梦魇·无冠者' })
  expect(disk.points[0]).not.toHaveProperty('variant')
  store.setPointType('normal-boss')
  store.setIcon(nightmare.id)
  expect(store.draft).not.toHaveProperty('iconId')
  expect(store.draft).toMatchObject({ name: '梦魇·无冠者' })
  store.setPointType('service')
  store.setName('独立名称')
  expect(store.draft).not.toHaveProperty('variant')
  expect(store.draft).toMatchObject({ name: '独立名称', mode: 'landmark' })
})

it('does not derive travel capability from a selected service icon', async () => {
  const store = usePointEditorStore()
  await store.load('echo')
  const service = navigationTypeIcons('small-beacon')[0]
  if (!service) throw new Error('需要服务点')
  store.setReferenceData({ ...referenceDataset, navigationPoints: [], navigationPointGroups: [] }, { version: 1, points: [] })
  store.switchEditorTab('navigation')
  store.setPointType('service')
  store.setIcon(service.id)
  expect(store.draft).toMatchObject({ pointType: 'service', navigationKind: 'service', mode: 'landmark', iconId: service.id })
})

it('allows a custom icon URL for an empty list and replaces it when switching to a fixed list', async () => {
  const store = usePointEditorStore()
  await store.load('echo')
  store.switchEditorTab('navigation')
  store.setPointType('service')
  store.setName('自定义服务')
  store.setCoordinateText('1, 2, 3')
  store.applyCoordinateText()
  store.setIconUrl('javascript:alert(1)')
  expect(store.inputErrors.icon).toContain('HTTPS')
  expect(await store.savePoint()).toBe(false)
  store.setIconUrl('https://example.com/custom-icon.png')
  expect(store.inputErrors.icon).toBeUndefined()
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).toMatchObject({ name: '自定义服务', iconUrl: 'https://example.com/custom-icon.png' })
  store.setPointType('central-beacon')
  const fixed = store.draft
  store.setIconUrl('https://example.com/disallowed.png')
  expect(store.draft).toBe(fixed)
  expect(store.draft).not.toHaveProperty('iconUrl')
  expect(store.draft).toMatchObject({ name: '中枢信标' })
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

  store.setPointType('remnant-settlement')
  expect(store.draft).not.toHaveProperty('iconId')
  const options = navigationTypeIcons('remnant-settlement')
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
  expect(disk.points[0]).toMatchObject({ name: '我记录的山脚聚落', pointType: 'remnant-settlement', iconId: options[1].id })
  const savedId = disk.points[0]?.id
  if (!savedId) throw new Error('需要保存的聚落')
  store.newPoint('navigation')
  store.selectPoint(savedId)
  expect(store.draft).toMatchObject({ name: '我记录的山脚聚落', pointType: 'remnant-settlement' })
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
