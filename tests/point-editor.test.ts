import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePointEditorStore } from '../src/stores/point-editor.ts'
import { useAssetsStore } from '../src/stores/assets.ts'
import { loadMapAssetCatalog, loadMapDataset } from '../src/data/load.ts'
import { readEditorLibrary, saveEditorLibrary } from '../src/data/editor-client.ts'
import { referenceDataset, mixedPoint, smallEcho, eliteEcho } from './fixtures/point-library.ts'
import type { OfficialAsset, PointLibrary } from '../src/domain/types.ts'

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
  it('initializes a pristine draft from validated map context without making it dirty', async () => {
    const floorState = referenceDataset.states.find(({ layeredMaps }) => layeredMaps.some(({ floors }) => floors.length > 0))
    const floor = floorState?.layeredMaps.flatMap(({ floors }) => floors)[0]
    const country = referenceDataset.regionLabels.find(({ level }) => level === 1)
    const countryState = referenceDataset.states.find(({ id }) => id === country?.stateId)
    const gravityState = referenceDataset.states.find(({ gravityTiles }) => gravityTiles.length > 0)
    if (!floorState || !floor || !country || !countryState || !gravityState) throw new Error('测试数据缺少可用于录入上下文的地图')
    const store = usePointEditorStore()
    await store.load()
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
    await store.load()
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

  it('keeps official points read-only without replacing or discarding either editing form', async () => {
    const official = { ...mixedPoint('official:one'), status: 'imported' as const, officialIds: ['one', 'two'], coordinate: { x: -497, y: 449, z: 0 } }
    vi.mocked(loadMapDataset).mockResolvedValue({ dataset: referenceDataset, officialLibrary: { version: 1, points: [official] } })
    const store = usePointEditorStore()
    await store.load()
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
    await store.load()
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
    const icon = referenceDataset.navigationPoints.find(({ kind, iconUrl }) => kind === 'beacon' && iconUrl)
    if (!icon) throw new Error('测试数据缺少信标图标')
    const store = usePointEditorStore()
    await store.load()
    store.newPoint('navigation')
    store.setCoordinateText('100, 200, 30')
    store.applyCoordinateText()
    expect(await store.savePoint()).toBe(false)
    expect(store.inputErrors.name).toBeTruthy()
    expect(store.inputErrors.icon).toBeTruthy()
    store.setName('测试信标')
    store.setIcon(icon.id)
    store.setMode('fast-travel')
    store.setTeleportCoordinate('x', '110')
    expect(await store.savePoint()).toBe(false)
    store.setTeleportCoordinateText('110, 220, 40')
    store.applyTeleportCoordinateText()
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]).toMatchObject({ iconSourceId: icon.id, mode: 'fast-travel', coordinate: { x: 100, y: 200, z: 30 }, teleportCoordinate: { x: 110, y: 220, z: 40 } })
    store.clearTeleportCoordinate()
    expect(await store.savePoint()).toBe(true)
    expect(disk.points[0]?.kind === 'navigation' ? disk.points[0].teleportCoordinate : null).toBeUndefined()
    store.setTeleportCoordinate('x', 'bad')
    store.setMode('landmark')
    expect(store.inputErrors['teleport:x']).toBeUndefined()
    expect(await store.savePoint()).toBe(true)
  })

  it('keeps failed saves and recovers either point kind from the automatic cache', async () => {
    const store = usePointEditorStore()
    await store.load()
    store.newPoint('navigation')
    store.setName('未完成的定位点')
    setActivePinia(createPinia())
    const reopened = usePointEditorStore()
    await reopened.load()
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
    await store.load()
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
    await store.load()
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
    await store.load()
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
    await store.load()
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
    await store.load()
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
    await reopened.load()
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
    await store.load()
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
    await store.load()
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
  await store.load()
  const empty = { x: null, y: null, z: null }
  store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '-12,'))
  expect(store.hasUnsavedChanges).toBe(true)
  store.switchEditorTab('navigation')
  store.updateCoordinateInput(false, switchCoordinateInput(store.positionInput, empty, 'axes'))
  store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, empty, '-', 'x'))
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
  await store.load()
  store.addMember(smallEcho.id)
  store.updateCoordinateInput(false, editCoordinateInput(store.positionInput, { x: null, y: null, z: null }, 'X: -12, Y: 34, Z: 56'))
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]?.coordinate).toEqual({ x: -12, y: 34, z: 56 })
})


it('fills the name only when the selected icon has a single child name', async () => {
  const asset: OfficialAsset = {
    id: 'single-name', category: 'service', categories: ['service'], name: '  测试商店  ',
    url: 'https://example.com/single.png', previewUrl: 'https://example.com/single.png',
    sourceUrl: 'https://example.com', fetchedAt: '', stateIds: [], referenceIds: [], tags: [], recordCount: 1,
  }
  vi.mocked(loadMapAssetCatalog).mockResolvedValue({ version: 1, resourceHash: 'test', assets: [
    asset, { ...asset, id: 'multiple-names', name: '商店 / NPC', url: 'https://example.com/multiple.png' },
  ] })
  await useAssetsStore().load()
  const store = usePointEditorStore()
  await store.load()
  store.switchEditorTab('navigation')
  await store.savePoint()
  expect(store.inputErrors.name).toBeTruthy()
  store.setAssetIcon('single-name')
  expect(store.draft).toMatchObject({ name: '测试商店', iconUrl: asset.url })
  expect(store.inputErrors.name).toBeUndefined()
  store.setName('手动名称')
  store.setAssetIcon('multiple-names')
  expect(store.draft).toMatchObject({ name: '手动名称' })
  store.setAssetIcon('single-name')
  expect(store.draft).toMatchObject({ name: '测试商店' })
})

it('persists an optional navigation type independently of icon selection and allows clearing it', async () => {
  const store = usePointEditorStore()
  await store.load()
  store.switchEditorTab('navigation')
  store.setPointType('weekly-boss')
  store.setName('测试定位点')
  const icon = referenceDataset.navigationPoints.find(({ kind }) => kind === 'beacon')
  if (!icon) throw new Error('缺少信标图标')
  store.setIcon(icon.id)
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
  store.setPointType(null)
  expect(await store.savePoint()).toBe(true)
  expect(disk.points[0]).not.toHaveProperty('pointType')
})

it('resets both editing forms and recovery caches while preserving saved points', async () => {
  const store = usePointEditorStore()
  await store.load()
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
  await store.load()
  expect(store.draft?.coordinate).toEqual({ x: null, y: null, z: null })
  store.switchEditorTab('navigation')
  expect(store.draft).toMatchObject({ name: '', coordinate: { x: null, y: null, z: null } })
})

it('reuses main-map data and the loaded library when reopening the editor', async () => {
  const store = usePointEditorStore()
  store.setReferenceData(referenceDataset, { version: 1, points: [] })
  await store.load()
  expect(loadMapDataset).not.toHaveBeenCalled()
  expect(readEditorLibrary).toHaveBeenCalledTimes(1)
  store.addMember(smallEcho.id)
  store.resetSession()
  await store.load()
  expect(loadMapDataset).not.toHaveBeenCalled()
  expect(readEditorLibrary).toHaveBeenCalledTimes(1)
  expect(store.draft).toMatchObject({ members: [], coordinate: { x: null, y: null, z: null } })
  expect(store.busy).toBe(false)
})

it('allows retry after the initial editor library load fails', async () => {
  const store = usePointEditorStore()
  store.setReferenceData(referenceDataset, { version: 1, points: [] })
  vi.mocked(readEditorLibrary).mockRejectedValueOnce(new Error('暂时不可用'))
  await store.load()
  expect(store.error).toBe('暂时不可用')
  await store.load()
  expect(readEditorLibrary).toHaveBeenCalledTimes(2)
  expect(store.error).toBe('')
})
