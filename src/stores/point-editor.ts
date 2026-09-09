import { computed, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { freeze, produce } from 'immer'
import { authoredPointSchema } from '../domain/schema.ts'
import { emptyPointLibrary, parseCoordinateInput, parsePointLibrary, pointTitle } from '../domain/point-library.ts'
import type { AuthoredPoint, MapDataset, PointLibrary } from '../domain/types.ts'
import type { NavigationKind, NavigationMode } from '../domain/types.ts'
import { appendObservation, combinePointLibraries, findNearbyPoints } from '../domain/point-matching.ts'
import { readEditorLibrary, readEditorVersion, readEditorVersions, saveEditorLibrary } from '../data/editor-client.ts'
import { loadMapDataset } from '../data/load.ts'
import { hasGravityMap } from '../domain/gravity.ts'
import type { GravityType } from '../domain/types.ts'

const DRAFT_KEY = 'echo-map:point-editor:draft:v1'

export const usePointEditorStore = defineStore('point-editor', () => {
  const dataset = shallowRef<MapDataset | null>(null)
  const library = shallowRef<PointLibrary>(freeze(emptyPointLibrary(), true))
  const officialLibrary = shallowRef<PointLibrary>(freeze(emptyPointLibrary(), true))
  const showOfficial = shallowRef(true)
  const mapTileError = shallowRef(false)
  const mapTileRetry = shallowRef(0)
  const trackingEchoId = shallowRef('')
  const matchRadius = shallowRef(30)
  const heightTolerance = shallowRef(8)
  const separateMatchKey = shallowRef('')
  const revision = shallowRef('')
  const draft = shallowRef<AuthoredPoint | null>(null)
  const baseline = shallowRef('')
  const recovery = shallowRef<AuthoredPoint | null>(null)
  const deleted = shallowRef<AuthoredPoint | null>(null)
  const importPreview = shallowRef<PointLibrary | null>(null)
  const versions = shallowRef<Awaited<ReturnType<typeof readEditorVersions>>>([])
  const search = shallowRef('')
  const monsterSearch = shallowRef('')
  const coordinateText = shallowRef('')
  const teleportCoordinateText = shallowRef('')
  const error = shallowRef('')
  const notice = shallowRef('')
  const busy = shallowRef(false)
  const inputErrors = shallowRef<Record<string, string>>({})
  const dirty = computed(() => draft.value !== null && (JSON.stringify(draft.value) !== baseline.value || Object.keys(inputErrors.value).length > 0))
  const allPoints = computed(() => freeze(combinePointLibraries(library.value, officialLibrary.value, showOfficial.value ? 'all' : 'manual'), true).points)
  const filteredPoints = computed(() => allPoints.value.filter((point) => {
    const query = search.value.trim().toLocaleLowerCase('zh-CN')
    const teleportCoordinate = point.kind === 'navigation' ? Object.values(point.teleportCoordinate ?? {}).join(' ') : ''
    return !query || `${dataset.value ? pointTitle(point, dataset.value) : ''} ${point.note} ${Object.values(point.coordinate).join(' ')} ${teleportCoordinate}`.toLocaleLowerCase('zh-CN').includes(query)
  }))
  const nearbyPoints = computed(() => draft.value ? findNearbyPoints(allPoints.value, draft.value, matchRadius.value, heightTolerance.value) : [])
  const matchKey = computed(() => JSON.stringify([draft.value?.id, draft.value?.coordinate, draft.value?.stateId, draft.value?.levelId, draft.value?.gravityType, nearbyPoints.value.map(({ point }) => point.id)]))
  const requiresMatchDecision = computed(() => draft.value?.kind === 'echo' && !library.value.points.some(({ id }) => id === draft.value?.id) && !draft.value.replacesOfficialIds?.length && nearbyPoints.value.length > 0 && separateMatchKey.value !== matchKey.value)

  function cacheDraft(): void {
    try {
      if (draft.value && dirty.value) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft.value))
      else localStorage.removeItem(DRAFT_KEY)
    } catch {
      notice.value = '浏览器草稿缓存不可用，请保存到点位库后再离开。'
    }
  }

  function openDraft(point: AuthoredPoint): void {
    draft.value = freeze(point, true)
    baseline.value = JSON.stringify(point)
    coordinateText.value = ''
    teleportCoordinateText.value = ''
    monsterSearch.value = ''
    inputErrors.value = {}
  }

  function canSwitch(): boolean {
    if (busy.value) return false
    if (dirty.value) {
      error.value = '请先保存当前编辑，或点击“放弃修改”。'
      return false
    }
    return true
  }

  function newPoint(kind: AuthoredPoint['kind'] = 'echo'): void {
    if (!canSwitch()) return
    const previous = draft.value
    const base = {
      id: crypto.randomUUID(), status: 'draft' as const, stateId: previous?.stateId ?? (dataset.value?.states.some(({ id }) => id === 8) ? 8 : dataset.value?.states[0]?.id ?? 8),
      countryId: previous?.countryId ?? null, levelId: previous?.levelId ?? null,
      gravityType: previous?.gravityType ?? null,
      coordinate: { x: null, y: null, z: null }, note: '',
    }
    openDraft(kind === 'echo' ? { ...base, kind, compositionStatus: 'partial', members: trackingEchoId.value ? [{ echoId: trackingEchoId.value, count: 1 }] : [] } : { ...base, kind, name: '', navigationKind: 'beacon', mode: 'fast-travel' })
    error.value = ''
    cacheDraft()
  }

  function selectPoint(id: string): void {
    if (!canSwitch()) return
    const point = allPoints.value.find((point) => point.id === id)
    if (point?.status === 'imported') {
      openDraft({ ...point, id: crypto.randomUUID(), status: 'draft', replacesOfficialIds: point.officialIds ?? [point.id], coordinate: { ...point.coordinate, z: null } })
      notice.value = '正在补录官方点，保存后写入人工文件。请填写实测 XYZ。'
    } else if (point) openDraft(point)
    error.value = ''
    cacheDraft()
  }

  function edit(recipe: (point: AuthoredPoint) => void): void {
    if (!draft.value || busy.value) return
    draft.value = freeze(produce(draft.value, recipe), true)
    error.value = ''
    notice.value = ''
    cacheDraft()
  }

  function setCoordinate(axis: 'x' | 'y' | 'z', value: string): void {
    if (value.trim() !== '' && !/^[+-]?\d+$/u.test(value.trim())) {
      invalidInput(axis, '坐标必须是整数')
      return
    }
    const number = value.trim() === '' ? null : Number(value)
    if (number !== null && !Number.isSafeInteger(number)) {
      invalidInput(axis, '坐标必须是有效整数')
      return
    }
    clearInputError(axis)
    edit((point) => {
      point.coordinate[axis] = number
      point.status = 'draft'
    })
  }

  function applyCoordinateText(): void {
    try {
      const coordinate = parseCoordinateInput(coordinateText.value)
      for (const axis of ['x', 'y', 'z']) clearInputError(axis)
      edit((point) => {
        point.coordinate = coordinate
        point.status = 'draft'
      })
    } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  }

  function setTeleportCoordinate(axis: 'x' | 'y' | 'z', value: string): void {
    const key = `teleport:${axis}`
    if (value.trim() !== '' && !/^[+-]?\d+$/u.test(value.trim())) {
      invalidInput(key, '传送落点坐标必须是整数')
      return
    }
    const number = value.trim() === '' ? null : Number(value)
    if (number !== null && !Number.isSafeInteger(number)) {
      invalidInput(key, '传送落点坐标必须是有效整数')
      return
    }
    clearInputError(key)
    edit((point) => {
      if (point.kind !== 'navigation') return
      const coordinate = point.teleportCoordinate ?? { x: null, y: null, z: null }
      coordinate[axis] = number
      if (Object.values(coordinate).every((entry) => entry === null)) delete point.teleportCoordinate
      else point.teleportCoordinate = coordinate
      point.status = 'draft'
    })
  }

  function applyTeleportCoordinateText(): void {
    try {
      const coordinate = parseCoordinateInput(teleportCoordinateText.value)
      for (const axis of ['x', 'y', 'z']) clearInputError(`teleport:${axis}`)
      edit((point) => {
        if (point.kind !== 'navigation') return
        point.teleportCoordinate = coordinate
        point.status = 'draft'
      })
    } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  }

  function pickMapPosition(x: number, y: number): void {
    for (const axis of ['x', 'y', 'z']) clearInputError(axis)
    edit((point) => {
      point.coordinate = { x: Math.round(x), y: Math.round(y), z: null }
      point.status = 'draft'
    })
    notice.value = '地图选取的是参考 XY，请在游戏中核验，并填写 Z。'
  }

  function selectState(stateId: number): void {
    for (const axis of ['x', 'y', 'z']) {
      clearInputError(axis)
      clearInputError(`teleport:${axis}`)
    }
    edit((point) => {
      point.stateId = stateId
      point.countryId = null
      point.levelId = null
      point.gravityType = null
      point.coordinate = { x: null, y: null, z: null }
      if (point.kind === 'navigation') delete point.teleportCoordinate
      point.status = 'draft'
    })
  }

  function addMember(echoId: string): void {
    if (!dataset.value?.echoes.some(({ id }) => id === echoId)) return
    edit((point) => {
      if (point.kind !== 'echo') return
      const existing = point.members.find((member) => member.echoId === echoId)
      if (existing) existing.count = Math.min(999, existing.count + 1)
      else point.members.push({ echoId, count: 1 })
      point.compositionStatus = 'partial'
      point.status = 'draft'
    })
  }

  function selectGravity(value: GravityType | null): void {
    if (value !== null && value !== 1 && value !== 2) return
    if (!hasGravityMap(dataset.value?.states.find(({ id }) => id === draft.value?.stateId))) return
    edit((point) => {
      point.gravityType = value
      point.status = 'draft'
    })
  }

  function setMemberCount(echoId: string, count: number): void {
    if (!Number.isInteger(count) || count < 1 || count > 999) {
      invalidInput(`count:${echoId}`, '怪物数量应为 1–999 的整数')
      return
    }
    clearInputError(`count:${echoId}`)
    edit((point) => {
      if (point.kind === 'echo') {
        const member = point.members.find((item) => item.echoId === echoId)
        if (member) member.count = count
        point.status = 'draft'
      }
    })
  }

  function removeMember(echoId: string): void {
    clearInputError(`count:${echoId}`)
    edit((point) => {
      if (point.kind === 'echo') {
        point.members = point.members.filter((member) => member.echoId !== echoId)
        point.status = 'draft'
      }
    })
  }

  async function load(): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      const [{ dataset: reference, officialLibrary: official }, snapshot] = await Promise.all([loadMapDataset(), readEditorLibrary()])
      dataset.value = freeze(reference, true)
      library.value = freeze(parsePointLibrary(snapshot.library, reference), true)
      officialLibrary.value = freeze(official, true)
      revision.value = snapshot.revision
      if (!draft.value) {
        try {
          const cached = localStorage.getItem(DRAFT_KEY)
          const parsed = cached ? authoredPointSchema.safeParse(JSON.parse(cached)) : null
          if (parsed?.success) recovery.value = freeze(parsed.data, true)
        } catch { recovery.value = null }
      }
      notice.value = '点位库已载入'
    } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
    finally { busy.value = false }
    if (dataset.value && !draft.value) {
      const pendingRecovery = recovery.value
      newPoint()
      recovery.value = pendingRecovery
      if (pendingRecovery) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(pendingRecovery)) } catch { /* Recovery remains available in memory. */ } }
    }
  }

  async function commit(next: PointLibrary): Promise<boolean> {
    if (busy.value || !dataset.value || !revision.value) return false
    busy.value = true
    error.value = ''
    try {
      const libraryToSave = parsePointLibrary(next, dataset.value, 'manual')
      const snapshot = await saveEditorLibrary(libraryToSave, revision.value)
      library.value = freeze(snapshot.library, true)
      revision.value = snapshot.revision
      notice.value = '已保存到本机文件'
      return true
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : String(failure)
      return false
    }
    finally { busy.value = false }
  }

  async function saveDraft(status: AuthoredPoint['status'], continueAdding = false): Promise<void> {
    if (!draft.value) return
    if (requiresMatchDecision.value) {
      error.value = '附近已有点位，请先选择追加到已有点，或确认这是独立的新点位。'
      return
    }
    const invalid = Object.values(inputErrors.value)[0]
    if (invalid) {
      error.value = invalid
      return
    }
    const saved = produce(draft.value, (point) => { point.status = status })
    const next = produce(library.value, (library) => {
      const index = library.points.findIndex(({ id }) => id === saved.id)
      if (index >= 0) library.points[index] = saved
      else library.points.push(saved)
    })
    if (await commit(next)) {
      openDraft(saved)
      recovery.value = null
      cacheDraft()
      if (continueAdding) newPoint(saved.kind)
    }
  }

  function discardChanges(): void {
    if (busy.value) return
    inputErrors.value = {}
    const saved = library.value.points.find(({ id }) => id === draft.value?.id)
    if (saved) openDraft(saved)
    else {
      baseline.value = JSON.stringify(draft.value)
      newPoint(draft.value?.kind)
    }
    recovery.value = null
    error.value = ''
    notice.value = ''
    cacheDraft()
  }

  function discardEmptyMapDraft(id: string): boolean {
    const point = draft.value
    if (!point || busy.value || point.id !== id || library.value.points.some(({ id: savedId }) => savedId === id) || point.replacesOfficialIds?.length) return false
    const hasMapPosition = point.coordinate.x !== null && point.coordinate.y !== null
    const hasCommonContent = point.coordinate.z !== null || point.note.trim() !== ''
    const hasKindContent = point.kind === 'echo'
      ? point.members.length > 0 || point.compositionStatus === 'complete'
      : point.name.trim() !== '' || point.navigationKind !== 'beacon' || point.mode !== 'fast-travel' || point.teleportCoordinate !== undefined
    if (!hasMapPosition || hasCommonContent || hasKindContent) return false
    discardChanges()
    return true
  }

  function copyPoint(): void {
    if (!draft.value || !canSwitch()) return
    const copy = produce(draft.value, (point) => {
      delete point.replacesOfficialIds
      delete point.officialIds
      point.id = crypto.randomUUID()
      point.status = 'draft'
      point.coordinate = { x: null, y: null, z: null }
      if (point.kind === 'navigation') delete point.teleportCoordinate
    })
    openDraft(copy)
    baseline.value = ''
    cacheDraft()
  }

  async function deletePoint(): Promise<void> {
    const point = library.value.points.find(({ id }) => id === draft.value?.id)
    if (!point) return
    if (await commit(produce(library.value, (library) => { library.points = library.points.filter(({ id }) => id !== point.id) }))) {
      deleted.value = point
      baseline.value = JSON.stringify(draft.value)
      inputErrors.value = {}
      newPoint(point.kind)
    }
  }

  async function undoDelete(): Promise<void> {
    const point = deleted.value
    if (!point || !canSwitch()) return
    if (await commit(produce(library.value, (library) => { library.points.push(point) }))) {
      deleted.value = null
      openDraft(point)
    }
  }

  function recoverDraft(): void {
    if (!recovery.value || !canSwitch()) return
    const cached = recovery.value
    const saved = library.value.points.find(({ id }) => id === cached.id)
    openDraft(cached)
    baseline.value = saved ? JSON.stringify(saved) : ''
    recovery.value = null
    cacheDraft()
  }

  function previewImport(text: string): void {
    if (!dataset.value || !canSwitch()) return
    try {
      importPreview.value = freeze(parsePointLibrary(JSON.parse(text), dataset.value, 'manual'), true)
      error.value = ''
    }
    catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  }

  async function applyImport(): Promise<void> {
    if (!importPreview.value || !canSwitch()) return
    if (await commit(importPreview.value)) {
      importPreview.value = null
      draft.value = null
      baseline.value = ''
      deleted.value = null
      recovery.value = null
      newPoint()
    }
  }

  async function loadVersions(): Promise<void> {
    try { versions.value = freeze(await readEditorVersions(), true) }
    catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  }

  async function previewVersion(revision: string): Promise<void> {
    if (!canSwitch()) return
    try { previewImport(JSON.stringify(await readEditorVersion(revision))) }
    catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  }

  function invalidInput(key: string, message: string): void {
    inputErrors.value = produce(inputErrors.value, (errors) => { errors[key] = message })
    error.value = message
  }

  function clearInputError(key: string): void {
    inputErrors.value = produce(inputErrors.value, (errors) => { delete errors[key] })
  }

  function appendToNearby(id: string): void {
    if (busy.value || draft.value?.kind !== 'echo') return
    if (Object.keys(inputErrors.value).length > 0) {
      error.value = '请先修正坐标或数量输入。'
      return
    }
    const target = nearbyPoints.value.find(({ point }) => point.id === id)?.point
    if (target?.kind !== 'echo') return
    if (library.value.points.some(({ id }) => id === draft.value?.id)) {
      error.value = '当前正在编辑已有点位。请从“＋ 刷取点”开始新的追踪记录后追加。'
      return
    }
    const merged = appendObservation(target, draft.value)
    openDraft(merged)
    baseline.value = target.status === 'imported' ? '' : JSON.stringify(target)
    error.value = ''
    notice.value = target.status === 'imported' ? '已合并到人工补录草稿；保存后替代这处官方点。' : '已追加到已有点位；保留原 XYZ，同种声骸取较大数量，可在清单中调整。'
    cacheDraft()
  }

  function setTrackingEcho(id: string): void {
    if (id && !dataset.value?.echoes.some((echo) => echo.id === id)) return
    trackingEchoId.value = id
    const pristineNew = !dirty.value && !library.value.points.some(({ id }) => id === draft.value?.id) && draft.value && Object.values(draft.value.coordinate).every((value) => value === null)
    if (pristineNew && draft.value?.kind === 'echo') {
      openDraft(produce(draft.value, (point) => {
        point.members = id ? [{ echoId: id, count: 1 }] : []
      }))
      cacheDraft()
    } else if (id && draft.value?.kind === 'echo' && draft.value.members.length === 0) addMember(id)
  }

  function setMatchingDistance(kind: 'radius' | 'height', value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 500 || (kind === 'radius' && value === 0)) return
    if (kind === 'radius') matchRadius.value = value
    else heightTolerance.value = value
  }

  return {
    selectGravity,
    mapTileError: shallowReadonly(mapTileError), mapTileRetry: shallowReadonly(mapTileRetry),
    reportMapTileError: (failed: boolean) => { mapTileError.value = failed },
    retryMapTiles: () => { mapTileError.value = false; mapTileRetry.value += 1 },
    officialLibrary: shallowReadonly(officialLibrary), showOfficial: shallowReadonly(showOfficial), allPoints,
    trackingEchoId: shallowReadonly(trackingEchoId), matchRadius: shallowReadonly(matchRadius), heightTolerance: shallowReadonly(heightTolerance), requiresMatchDecision,
    appendToNearby, setTrackingEcho, setMatchingDistance,
    setOfficialVisible: (value: boolean) => { showOfficial.value = value },
    confirmSeparatePoint: () => { separateMatchKey.value = matchKey.value },
    setCompositionComplete: (value: boolean) => edit((point) => { if (point.kind === 'echo') point.compositionStatus = value ? 'complete' : 'partial' }),
    dataset: shallowReadonly(dataset), library: shallowReadonly(library), draft: shallowReadonly(draft),
    recovery: shallowReadonly(recovery), deleted: shallowReadonly(deleted), importPreview: shallowReadonly(importPreview),
    versions: shallowReadonly(versions), search: shallowReadonly(search), monsterSearch: shallowReadonly(monsterSearch), coordinateText: shallowReadonly(coordinateText), teleportCoordinateText: shallowReadonly(teleportCoordinateText),
    error: shallowReadonly(error), notice: shallowReadonly(notice), busy: shallowReadonly(busy), dirty, filteredPoints, nearbyPoints,
    load, newPoint, selectPoint, setCoordinate, applyCoordinateText, setTeleportCoordinate, applyTeleportCoordinateText, pickMapPosition, selectState, addMember, setMemberCount, removeMember,
    saveDraft, discardChanges, discardEmptyMapDraft, copyPoint, deletePoint, undoDelete, recoverDraft, previewImport, applyImport, loadVersions, previewVersion,
    setSearch: (value: string) => { search.value = value },
    setMonsterSearch: (value: string) => { monsterSearch.value = value },
    setCoordinateText: (value: string) => { coordinateText.value = value },
    setTeleportCoordinateText: (value: string) => { teleportCoordinateText.value = value },
    setLevel: (value: string | null) => edit((point) => {
      point.levelId = value
      point.status = 'draft'
    }),
    setCountry: (value: number | null) => edit((point) => { point.countryId = value }),
    setNote: (value: string) => edit((point) => { point.note = value }),
    setName: (value: string) => edit((point) => { if (point.kind === 'navigation') point.name = value }),
    setNavigationKind: (value: NavigationKind) => edit((point) => {
      if (point.kind === 'navigation') {
        point.navigationKind = value
        point.status = 'draft'
      }
    }),
    setMode: (value: NavigationMode) => {
      if (value !== 'fast-travel') {
        for (const axis of ['x', 'y', 'z']) clearInputError(`teleport:${axis}`)
        teleportCoordinateText.value = ''
      }
      edit((point) => {
        if (point.kind === 'navigation') {
          point.mode = value
          if (value !== 'fast-travel') delete point.teleportCoordinate
          point.status = 'draft'
        }
      })
    },
    cancelImport: () => { importPreview.value = null },
    reportError: (value: string) => { error.value = value },
    dismissMessage: () => {
      error.value = ''
      notice.value = ''
    },
    dismissRecovery: () => {
      recovery.value = null
      cacheDraft()
    },
    closeVersions: () => { versions.value = [] },
  }
})
