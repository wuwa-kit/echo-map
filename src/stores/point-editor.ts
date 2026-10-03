import { emptyCoordinateInput, coordinateInputPending, coordinateInputXY, commitCoordinateInput, coordinateAxes } from '../components/base/coordinate-input.ts'
import type { CoordinateInputState, CoordinateInputChange } from '../components/base/coordinate-input.ts'
import { navigationTypeIcons } from '../domain/navigation-icons.ts'
import { navigationPointTypes } from '../domain/navigation-point-types.ts'
import { computed, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { freeze, produce } from 'immer'
import { navigationPointTypeSchema, navigationIconUrlSchema } from '../domain/schema.ts'
import { emptyPointLibrary, isOfficialPoint, parseCoordinateInput, parsePointDraft, parsePointLibrary } from '../domain/point-library.ts'
import type { AuthoredNavigationPoint, AuthoredPoint, MapDataset, PointLibrary, PointLibraryRevision } from '../domain/types.ts'
import type { NavigationMode, NavigationPointType } from '../domain/types.ts'
import { combinePointLibraries } from '../domain/point-matching.ts'
import { readEditorLibrary, saveEditorLibrary } from '../data/editor-client.ts'
import { loadMapDataset } from '../data/load.ts'
import { hasGravityMap } from '../domain/gravity.ts'
import type { GravityType } from '../domain/types.ts'
import { createFloorCoverage, floorsAtCoordinate } from '../map/floor-coverage.ts'
import { gameToMapCoordinate } from '../map/projection.ts'
import { useEqualComputed } from '../composables/useEqualComputed.ts'
import { serializeJson } from '../utils/json.ts'

const DRAFT_KEY = 'echo-map:point-editor:draft:v1'
const CONTINUE_ADDING_KEY = 'echo-map:point-editor:continue-adding:v1'
const RECENT_TYPES_KEY = 'echo-map:point-editor:recent-saved-types:v1'
const RECENT_TYPES_LIMIT = 4
const POSITION_CONFIRM_INTERVAL = 600

type EditorKind = AuthoredPoint['kind']
interface EditorForm {
  positionInput: CoordinateInputState
  arrivalInput: CoordinateInputState
  draft: AuthoredPoint | null
  baseline: string
  recovery: AuthoredPoint | null
  monsterSearch: string
  coordinateText: string
  teleportCoordinateText: string
  inputValues: Record<string, string>
  inputErrors: Record<string, string>
}
function emptyForm(): EditorForm {
  return { positionInput: emptyCoordinateInput(), arrivalInput: emptyCoordinateInput(), draft: null, baseline: '', recovery: null, monsterSearch: '', coordinateText: '', teleportCoordinateText: '', inputValues: {}, inputErrors: {} }
}
function formDirty(form: EditorForm): boolean {
  return form.draft !== null && (JSON.stringify(form.draft) !== form.baseline || Object.keys(form.inputErrors).length > 0 || coordinateInputPending(form.positionInput) || coordinateInputPending(form.arrivalInput))
}

interface PointEditorMapContext {
  stateId?: number
  levelId?: string
  gravityType?: GravityType
}

export const usePointEditorStore = defineStore('point-editor', () => {
  const dataset = shallowRef<MapDataset | null>(null)
  const library = shallowRef<PointLibrary>(freeze(emptyPointLibrary(), true))
  const officialLibrary = shallowRef<PointLibrary>(freeze(emptyPointLibrary(), true))
  const mapTileError = shallowRef(false)
  const mapTileRetry = shallowRef(0)
  const revision = shallowRef<PointLibraryRevision | null>(null)
  const storage = shallowRef<'project' | 'browser'>('project')
  const editorMode = shallowRef<EditorKind>('navigation')
  const continueAdding = shallowRef(false)
  const positionConfirmation = shallowRef<{ snapshot: string, pressedAt: number } | null>(null)
  const recentPointTypes = shallowRef<readonly NavigationPointType[]>([])
  const forms = shallowRef<Record<EditorKind, EditorForm>>({ echo: emptyForm(), navigation: emptyForm() })
  function formField<K extends keyof EditorForm>(key: K) {
    return computed({
      get: () => forms.value[editorMode.value][key],
      set: (value: EditorForm[K]) => {
        forms.value = produce(forms.value, (state) => {
          Object.assign(state[editorMode.value], { [key]: value })
        })
      },
    })
  }
  const positionInput = formField('positionInput')
  const arrivalInput = formField('arrivalInput')
  function resetCoordinateInput(teleport = false): void {
    const field = teleport ? arrivalInput : positionInput
    field.value = { ...emptyCoordinateInput(), mode: field.value.mode }
  }
  const draft = formField('draft')
  const pointState = computed(() => dataset.value?.states.find(({ id }) => id === draft.value?.stateId) ?? null)
  const floorCoverage = computed(() => createFloorCoverage(pointState.value, dataset.value?.source.tileWidth ?? 1024))
  const availableFloors = useEqualComputed(() => {
    const coordinate = draft.value ? coordinateInputXY(positionInput.value, draft.value.coordinate) : null
    return floorsAtCoordinate(floorCoverage.value, coordinate
      ? gameToMapCoordinate(coordinate[0], coordinate[1], dataset.value?.source.tileWidth) : null)
      .map(({ id, name }) => ({ id, name }))
  })
  const pointLevelId = computed(() => availableFloors.value.some(({ id }) => id === draft.value?.levelId) ? draft.value?.levelId ?? null : null)
  const completePoints = computed(() => freeze(combinePointLibraries(library.value, officialLibrary.value), true).points)
  const baseline = formField('baseline')
  const recovery = formField('recovery')
  const deleted = shallowRef<AuthoredPoint | null>(null)
  const importPreview = shallowRef<PointLibrary | null>(null)
  const monsterSearch = formField('monsterSearch')
  const coordinateText = formField('coordinateText')
  const teleportCoordinateText = formField('teleportCoordinateText')
  const error = shallowRef('')
  const notice = shallowRef('')
  const operation = shallowRef<'load' | 'save' | 'delete' | 'undo' | 'import' | null>(null)
  const busy = computed(() => operation.value !== null)
  const inputErrors = formField('inputErrors')
  const inputValues = formField('inputValues')
  const dirty = computed(() => formDirty(forms.value[editorMode.value]))
  const editing = computed(() => draft.value !== null)
  const canContinueAdding = computed(() => draft.value?.kind === 'navigation'
    && !draft.value.replacesOfficialIds?.length
    && !library.value.points.some(({ id }) => id === draft.value?.id))
  const allPoints = completePoints
  const hasUnsavedChanges = computed(() => Object.values(forms.value).some((form) => formDirty(form) || form.recovery !== null))

  function cacheDraft(): void {
    try {
      if (recovery.value) return
      if (draft.value && editing.value && dirty.value) localStorage.setItem(`${DRAFT_KEY}:${editorMode.value}`, serializeJson(draft.value))
      else localStorage.removeItem(`${DRAFT_KEY}:${editorMode.value}`)
    } catch {
      notice.value = '自动暂存不可用，请保存后再离开。'
    }
  }

  function openDraft(point: AuthoredPoint): void {
    resetPositionConfirmation()
    resetCoordinateInput()
    resetCoordinateInput(true)
    draft.value = freeze(point, true)
    reconcilePointLevel()
    baseline.value = JSON.stringify(draft.value)
    coordinateText.value = ''
    teleportCoordinateText.value = ''
    monsterSearch.value = ''
    inputErrors.value = {}
    inputValues.value = {}
  }

  function canSwitch(): boolean {
    if (busy.value) return false
    if (dirty.value) {
      error.value = '请先保存当前编辑。'
      return false
    }
    return true
  }

  function switchEditorTab(kind: EditorKind): void {
    if (busy.value || kind === editorMode.value) return
    resetPositionConfirmation()
    const context = draft.value
    cacheDraft()
    editorMode.value = kind
    error.value = ''
    notice.value = ''
    if (!draft.value) {
      newPoint(kind)
      if (context) initializeMapContext({ stateId: context.stateId, levelId: context.levelId ?? undefined, gravityType: context.gravityType ?? undefined })
    }
  }

  function newPoint(kind: AuthoredPoint['kind'] = editorMode.value): void {
    if (!canSwitch()) return
    const previous = draft.value
    editorMode.value = kind
    const base = {
      id: crypto.randomUUID(), stateId: previous?.stateId ?? (dataset.value?.states.some(({ id }) => id === 8) ? 8 : dataset.value?.states[0]?.id ?? 8),
      levelId: previous?.levelId ?? null,
      gravityType: previous?.gravityType ?? null,
      coordinate: { x: null, y: null, z: null }, note: '',
    }
    openDraft(kind === 'echo' ? { ...base, kind, compositionStatus: 'partial', members: [] } : { ...base, kind, name: '', navigationKind: 'landmark', mode: 'landmark' })
    error.value = ''
    cacheDraft()
  }

  function selectPoint(id: string): void {
    const point = completePoints.value.find((point) => point.id === id)
    if (!point || busy.value) return
    if (isOfficialPoint(point)) {
      error.value = ''
      notice.value = '官方点位为只读，不可编辑'
      return
    }
    switchEditorTab(point.kind)
    if (!canSwitch()) return
    openDraft(point)
    error.value = ''
    cacheDraft()
  }

  function edit(recipe: (point: AuthoredPoint) => void): void {
    if (!draft.value || busy.value) return
    draft.value = freeze(produce(draft.value, recipe), true)
    reconcilePointLevel()
    error.value = ''
    notice.value = ''
    cacheDraft()
  }

  function reconcilePointLevel(): void {
    const point = draft.value
    if (!point?.levelId || !coordinateInputXY(positionInput.value, point.coordinate)
      || availableFloors.value.some(({ id }) => id === point.levelId)) return
    draft.value = freeze(produce(point, (point) => { point.levelId = null }), true)
  }

  function setLevel(value: string | number | null): void {
    if (busy.value || !draft.value || typeof value === 'number'
      || value !== null && !availableFloors.value.some(({ id }) => id === value)
      || value === draft.value.levelId) return
    edit((point) => { point.levelId = value })
  }

  function updateCoordinateInput(teleport: boolean, change: CoordinateInputChange): void {
    if (!draft.value || busy.value) return
    if (teleport && (draft.value.kind !== 'navigation' || draft.value.mode !== 'fast-travel')) return
    forms.value = produce(forms.value, (forms) => {
      const form = forms[editorMode.value]
      form[teleport ? 'arrivalInput' : 'positionInput'] = change.state
      const point = form.draft
      if (!point || (teleport && point.kind !== 'navigation')) return
      const previous = teleport && point.kind === 'navigation' ? point.teleportCoordinate : point.coordinate
      const emptyArrival = teleport && coordinateAxes.every((axis) => change.value[axis] === null)
      if (emptyArrival && point.kind === 'navigation') {
        if (point.teleportCoordinate) {
          delete point.teleportCoordinate
        }
      } else if (coordinateAxes.some((axis) => (previous?.[axis] ?? null) !== change.value[axis])) {
        if (teleport && point.kind === 'navigation') point.teleportCoordinate = change.value
        else point.coordinate = change.value
      }
      const clearedArrival = emptyArrival && change.valid && !coordinateInputPending(change.state)
      for (const axis of coordinateAxes) {
        if (!clearedArrival && (change.value[axis] === null || (change.state.text === null && change.state.axes[axis] === null))) continue
        const key = teleport ? `teleport:${axis}` : axis
        delete form.inputErrors[key]
        delete form.inputValues[key]
      }
    })
    if (!teleport) reconcilePointLevel()
    error.value = ''
    cacheDraft()
  }

  function setCoordinate(axis: 'x' | 'y' | 'z', value: string): void {
    resetCoordinateInput()
    inputValues.value = produce(inputValues.value, (values) => { values[axis] = value })
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
    })
  }

  function applyCoordinateText(): void {
    try {
      const coordinate = parseCoordinateInput(coordinateText.value)
      resetCoordinateInput()
      for (const axis of ['x', 'y', 'z']) {
        clearInputError(axis)
        clearInputValue(axis)
      }
      edit((point) => {
        point.coordinate = coordinate
      })
    } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  }

  function setTeleportCoordinate(axis: 'x' | 'y' | 'z', value: string): void {
    if (busy.value || draft.value?.kind !== 'navigation' || draft.value.mode !== 'fast-travel') return
    resetCoordinateInput(true)
    const key = `teleport:${axis}`
    inputValues.value = produce(inputValues.value, (values) => { values[key] = value })
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
    })
  }

  function applyTeleportCoordinateText(): void {
    if (busy.value || draft.value?.kind !== 'navigation' || draft.value.mode !== 'fast-travel') return
    try {
      const coordinate = parseCoordinateInput(teleportCoordinateText.value)
      resetCoordinateInput(true)
      for (const axis of ['x', 'y', 'z']) {
        clearInputError(`teleport:${axis}`)
        clearInputValue(`teleport:${axis}`)
      }
      edit((point) => {
        if (point.kind !== 'navigation') return
        point.teleportCoordinate = coordinate
      })
    } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  }

  function selectState(stateId: number): void {
    resetCoordinateInput()
    resetCoordinateInput(true)
    for (const axis of ['x', 'y', 'z']) {
      clearInputError(axis)
      clearInputError(`teleport:${axis}`)
      clearInputValue(axis)
      clearInputValue(`teleport:${axis}`)
    }
    edit((point) => {
      point.stateId = stateId
      point.levelId = null
      point.gravityType = null
      point.coordinate = { x: null, y: null, z: null }
      if (point.kind === 'navigation') delete point.teleportCoordinate
    })
  }

  function initializeMapContext(context: PointEditorMapContext): void {
    const currentDataset = dataset.value
    const currentDraft = draft.value
    if (!currentDataset || !currentDraft || dirty.value || library.value.points.some(({ id }) => id === currentDraft.id)) return
    const state = currentDataset.states.find(({ id }) => id === context.stateId)
      ?? currentDataset.states.find(({ id }) => id === currentDraft.stateId)
      ?? currentDataset.states[0]
    if (!state) return
    const floorIds = new Set(state.layeredMaps.flatMap(({ floors }) => floors.map(({ id }) => id)))
    openDraft(produce(currentDraft, (point) => {
      point.stateId = state.id
      point.levelId = context.levelId !== undefined && floorIds.has(context.levelId) ? context.levelId : null
      point.gravityType = hasGravityMap(state) && (context.gravityType === 1 || context.gravityType === 2)
        ? context.gravityType
        : null
    }))
    cacheDraft()
  }

  function addMember(echoId: string): void {
    if (!dataset.value?.echoes.some(({ id }) => id === echoId)) return
    clearInputError('members')
    clearInputError(`count:${echoId}`)
    clearInputValue(`count:${echoId}`)
    edit((point) => {
      if (point.kind !== 'echo') return
      const existing = point.members.find((member) => member.echoId === echoId)
      if (existing) existing.count = Math.min(999, existing.count + 1)
      else point.members.push({ echoId, count: 1 })
      point.compositionStatus = 'partial'
    })
  }

  function selectGravity(value: GravityType | null): void {
    if (value !== null && value !== 1 && value !== 2) return
    if (!hasGravityMap(dataset.value?.states.find(({ id }) => id === draft.value?.stateId))) return
    edit((point) => {
      point.gravityType = value
    })
  }

  function setMemberCount(echoId: string, value: number | string): void {
    inputValues.value = produce(inputValues.value, (values) => { values[`count:${echoId}`] = String(value) })
    const count = Number(value)
    if (!Number.isInteger(count) || count < 1 || count > 999) {
      invalidInput(`count:${echoId}`, '怪物数量应为 1–999 的整数')
      return
    }
    clearInputError(`count:${echoId}`)
    edit((point) => {
      if (point.kind === 'echo') {
        const member = point.members.find((item) => item.echoId === echoId)
        if (member) member.count = count
      }
    })
  }

  function adjustMemberCount(echoId: string, delta: -1 | 1): void {
    if (busy.value || draft.value?.kind !== 'echo') return
    const member = draft.value.members.find((member) => member.echoId === echoId)
    if (!member) return
    const count = member.count + delta
    if (count <= 0) removeMember(echoId)
    else setMemberCount(echoId, Math.min(999, count))
  }

  function removeMember(echoId: string): void {
    clearInputValue(`count:${echoId}`)
    clearInputError(`count:${echoId}`)
    edit((point) => {
      if (point.kind === 'echo') {
        point.members = point.members.filter((member) => member.echoId !== echoId)
      }
    })
  }

  function setReferenceData(reference: MapDataset, official: PointLibrary): void {
    dataset.value = freeze(reference, true)
    officialLibrary.value = freeze(official, true)
  }

  function resetPositionConfirmation(): void {
    positionConfirmation.value = null
  }

  function confirmPosition(inView: boolean, now = Date.now()): 'locate' | 'wait' | 'save' {
    const point = draft.value
    if (busy.value || !point) return 'wait'
    const xy = coordinateInputXY(positionInput.value, point.coordinate)
    if (!xy || coordinateInputPending(positionInput.value) || positionInput.value.invalid
      || coordinateAxes.some((axis) => !Number.isSafeInteger(point.coordinate[axis]))) {
      resetPositionConfirmation()
      return xy ? 'locate' : 'wait'
    }
    if (!inView) {
      resetPositionConfirmation()
      return 'locate'
    }
    const snapshot = JSON.stringify(point)
    const confirmation = positionConfirmation.value
    if (confirmation?.snapshot !== snapshot || now < confirmation.pressedAt || now - confirmation.pressedAt > POSITION_CONFIRM_INTERVAL) {
      positionConfirmation.value = { snapshot, pressedAt: now }
      return 'wait'
    }
    resetPositionConfirmation()
    return 'save'
  }

  function restoreContinueAdding(): void {
    try { continueAdding.value = localStorage.getItem(CONTINUE_ADDING_KEY) === 'true' }
    catch { /* Keep the current preference if storage is unavailable. */ }
  }

  function setContinueAdding(value: boolean): void {
    if (busy.value) return
    continueAdding.value = value
    try { localStorage.setItem(CONTINUE_ADDING_KEY, String(value)) }
    catch { /* The preference remains available for this session. */ }
  }

  function restoreRecentPointTypes(): void {
    try {
      const cached = localStorage.getItem(RECENT_TYPES_KEY)
      const parsed = cached ? navigationPointTypeSchema.array().safeParse(JSON.parse(cached)) : null
      if (parsed?.success) recentPointTypes.value = freeze([...new Set(parsed.data)].slice(0, RECENT_TYPES_LIMIT))
    } catch { /* Keep recent types in memory if storage is unavailable. */ }
  }

  function rememberPointType(pointType: NavigationPointType): void {
    recentPointTypes.value = produce(recentPointTypes.value, (types) => {
      const index = types.indexOf(pointType)
      if (index >= 0) types.splice(index, 1)
      types.unshift(pointType)
      types.splice(RECENT_TYPES_LIMIT)
    })
    try { localStorage.setItem(RECENT_TYPES_KEY, JSON.stringify(recentPointTypes.value)) }
    catch { /* Recent types remain available for this session. */ }
  }

  async function load(kind: EditorKind = editorMode.value): Promise<void> {
    if (busy.value) return
    restoreContinueAdding()
    restoreRecentPointTypes()
    editorMode.value = kind
    if (dataset.value && revision.value) {
      if (!draft.value) newPoint()
      return
    }
    operation.value = 'load'
    error.value = ''
    try {
      const [{ dataset: reference, officialLibrary: official }, snapshot] = await Promise.all([dataset.value ? { dataset: dataset.value, officialLibrary: officialLibrary.value } : loadMapDataset(), readEditorLibrary()])
      dataset.value = freeze(reference, true)
      library.value = freeze(parsePointLibrary(snapshot.library, reference, 'manual'), true)
      officialLibrary.value = freeze(official, true)
      revision.value = snapshot.revision
      storage.value = snapshot.storage
      for (const kind of ['echo', 'navigation'] as const) {
        if (forms.value[kind].draft) continue
        try {
          const cached = localStorage.getItem(`${DRAFT_KEY}:${kind}`)
          if (!cached) continue
          const point = parsePointDraft(JSON.parse(cached), reference)
          if (point.kind === kind) forms.value = produce(forms.value, (state) => { state[kind].recovery = point })
        } catch { /* Ignore invalid cached input. */ }
      }
      notice.value = ''
    } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
    finally { operation.value = null }
    if (dataset.value && revision.value && !draft.value) {
      const pendingRecovery = recovery.value
      // Keep recovery set while creating the blank editor so cacheDraft cannot erase it.
      newPoint()
      recovery.value = pendingRecovery
      if (pendingRecovery) { try { localStorage.setItem(`${DRAFT_KEY}:${editorMode.value}`, serializeJson(pendingRecovery)) } catch { /* Recovery remains available in memory. */ } }
    }
  }

  async function commit(next: PointLibrary, action: 'save' | 'delete' | 'undo' | 'import'): Promise<boolean> {
    if (busy.value || !dataset.value || !revision.value) return false
    operation.value = action
    error.value = ''
    notice.value = ''
    try {
      const libraryToSave = parsePointLibrary(next, dataset.value, 'manual')
      const snapshot = await saveEditorLibrary(libraryToSave, revision.value, library.value, action === 'import')
      library.value = freeze(snapshot.library, true)
      revision.value = snapshot.revision
      storage.value = snapshot.storage
      notice.value = action === 'save' ? '保存成功' : storage.value === 'browser' ? '已保存到本机浏览器' : '已保存到本机文件'
      return true
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : String(failure)
      return false
    }
    finally { operation.value = null }
  }

  async function savePoint(options: { continueAdding?: boolean } = {}): Promise<boolean> {
    if (!draft.value || !editing.value || busy.value) return false
    resetPositionConfirmation()
    const addNext = options.continueAdding !== false && continueAdding.value && canContinueAdding.value
    notice.value = ''
    const position = commitCoordinateInput(positionInput.value, draft.value.coordinate)
    updateCoordinateInput(false, position)
    const arrival = commitCoordinateInput(arrivalInput.value, draft.value.kind === 'navigation' ? draft.value.teleportCoordinate ?? { x: null, y: null, z: null } : { x: null, y: null, z: null }, true)
    updateCoordinateInput(true, arrival)
    if (!position.valid || !arrival.valid) return false
    const errors = { ...inputErrors.value }
    for (const axis of ['x', 'y', 'z'] as const) {
      if (draft.value.coordinate[axis] === null) errors[axis] = '请填写整数坐标'
    }
    if (draft.value.kind === 'echo' && !draft.value.members.length) errors.members = '请添加至少一种声骸'
    if (draft.value.kind === 'navigation') {
      if (!draft.value.name.trim()) errors.name = '请填写名称'
      if (!draft.value.iconUrl && !draft.value.iconId) errors.icon = '请选择图标'
      if (draft.value.teleportCoordinate) {
        for (const axis of ['x', 'y', 'z'] as const) {
          if (draft.value.teleportCoordinate[axis] === null) errors[`teleport:${axis}`] = '请填写完整落点，或移除实际传送位置'
        }
      }
    }
    inputErrors.value = errors
    const invalid = Object.values(inputErrors.value)[0]
    if (invalid) {
      error.value = '请检查标出的字段'
      return false
    }
    const saved = draft.value
    const next = produce(library.value, (library) => {
      const index = library.points.findIndex(({ id }) => id === saved.id)
      if (index >= 0) library.points[index] = saved
      else library.points.push(saved)
    })
    if (await commit(next, 'save')) {
      if (saved.kind === 'navigation' && saved.pointType) rememberPointType(saved.pointType)
      openDraft(saved)
      recovery.value = null
      if (addNext && saved.kind === 'navigation') {
        newPoint('navigation')
        setPointType(saved.pointType ?? null)
        if (draft.value?.kind === 'navigation') {
          openDraft(produce(draft.value, (point) => {
            point.name = saved.pointType ? navigationPointTypes[saved.pointType].names[0] ?? '' : ''
          }))
        }
        notice.value = '保存成功'
      }
      cacheDraft()
      return true
    }
    return false
  }

  async function saveAllForms(): Promise<boolean> {
    const previous = editorMode.value
    for (const kind of ['echo', 'navigation'] as const) {
      if (!formDirty(forms.value[kind]) && !forms.value[kind].recovery) continue
      switchEditorTab(kind)
      if (recovery.value) recoverDraft()
      if (!await savePoint({ continueAdding: false })) return false
    }
    switchEditorTab(previous)
    return true
  }

  function discardAllForms(): void {
    const previous = editorMode.value
    for (const kind of ['echo', 'navigation'] as const) {
      switchEditorTab(kind)
      discardChanges()
    }
    switchEditorTab(previous)
  }

  function discardChanges(): void {
    if (busy.value) return
    resetCoordinateInput()
    resetCoordinateInput(true)
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

  function resetSession(): void {
    if (busy.value) return
    resetPositionConfirmation()
    forms.value = { echo: emptyForm(), navigation: emptyForm() }
    editorMode.value = 'navigation'
    deleted.value = null
    importPreview.value = null
    error.value = ''
    notice.value = ''
    for (const kind of ['echo', 'navigation']) {
      try { localStorage.removeItem(`${DRAFT_KEY}:${kind}`) } catch { /* Session is cleared in memory. */ }
    }
  }

  function closeEditor(): void {
    if (busy.value) return
    discardChanges()
    newPoint()
  }

  function hasAutomaticNavigationName(point: AuthoredNavigationPoint): boolean {
    const rule = point.pointType ? navigationPointTypes[point.pointType] : undefined
    return !point.name.trim() || point.name === rule?.name || rule?.names.length === 1 && point.name === rule.names[0]
  }

  function setPointType(value: string | number | null): void {
    if (busy.value || draft.value?.kind !== 'navigation') return
    const parsed = navigationPointTypeSchema.safeParse(value)
    if (value !== null && !parsed.success) return
    if (draft.value.pointType === (parsed.success ? parsed.data : undefined)) return
    const rule = parsed.success ? navigationPointTypes[parsed.data] : undefined
    const automaticName = hasAutomaticNavigationName(draft.value)
    const icons = navigationTypeIcons(parsed.success ? parsed.data : undefined)
    const selectedIconId = draft.value.iconId
    const icon = rule?.icons.length && icons.length === 1 ? icons[0] : icons.find(({ id }) => id === selectedIconId)
    const mode = rule?.defaultMode ?? draft.value.mode
    clearInputError('pointType')
    clearInputError('icon')
    clearInputError('name')
    if (mode !== 'fast-travel') clearArrivalInput()
    edit((point) => {
      if (point.kind !== 'navigation') return
      if (rule?.names.length === 1) point.name = rule.names[0]
      else if (automaticName && rule) point.name = rule.name
      if (parsed.success) point.pointType = parsed.data
      else delete point.pointType
      point.navigationKind = rule?.kind ?? 'landmark'
      point.mode = mode
      delete point.iconId
      if (rule?.icons.length) delete point.iconUrl
      if (icon) point.iconId = icon.id
      if (point.mode !== 'fast-travel') delete point.teleportCoordinate
    })
  }

  function setIcon(id: string): void {
    if (busy.value || draft.value?.kind !== 'navigation') return
    const icon = navigationTypeIcons(draft.value.pointType).find((icon) => icon.id === id)
    if (!icon) return
    const names = icon.name.split(' / ')
    const rule = draft.value.pointType ? navigationPointTypes[draft.value.pointType] : undefined
    const name = rule?.names[0] ?? (names.length === 1 ? names[0] : undefined)
    clearInputError('icon')
    if (name !== undefined) clearInputError('name')
    edit((point) => {
      if (point.kind !== 'navigation') return
      delete point.iconUrl
      point.iconId = icon.id
      if (name !== undefined) point.name = name
    })
  }

  function setIconUrl(value: string): void {
    if (busy.value || draft.value?.kind !== 'navigation') return
    const rule = draft.value.pointType ? navigationPointTypes[draft.value.pointType] : undefined
    if (rule?.icons.length) return
    const url = value.trim()
    if (url && !navigationIconUrlSchema.safeParse(url).success) {
      invalidInput('icon', '请输入有效的 HTTPS 图标地址')
      return
    }
    clearInputError('icon')
    edit((point) => {
      if (point.kind !== 'navigation') return
      delete point.iconId
      if (url) point.iconUrl = url
      else delete point.iconUrl
    })
  }

  function clearArrivalInput(): void {
    resetCoordinateInput(true)
    for (const axis of ['x', 'y', 'z']) {
      clearInputError(`teleport:${axis}`)
      clearInputValue(`teleport:${axis}`)
    }
    teleportCoordinateText.value = ''
  }

  function clearTeleportCoordinate(): void {
    if (busy.value) return
    clearArrivalInput()
    edit((point) => { if (point.kind === 'navigation') delete point.teleportCoordinate })
  }

  async function deletePoint(): Promise<void> {
    const point = library.value.points.find(({ id }) => id === draft.value?.id)
    if (!point) return
    if (await commit(produce(library.value, (library) => { library.points = library.points.filter(({ id }) => id !== point.id) }), 'delete')) {
      deleted.value = point
      baseline.value = JSON.stringify(draft.value)
      inputErrors.value = {}
      newPoint(point.kind)
    }
  }

  async function undoDelete(): Promise<void> {
    const point = deleted.value
    if (!point) return
    switchEditorTab(point.kind)
    if (!canSwitch()) return
    if (await commit(produce(library.value, (library) => { library.points.push(point) }), 'undo')) {
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
    importPreview.value = null
    try {
      const incoming = parsePointLibrary(JSON.parse(text), dataset.value, 'manual')
      importPreview.value = freeze(incoming, true)
      error.value = ''
    }
    catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  }

  async function applyImport(): Promise<void> {
    if (!importPreview.value || !canSwitch()) return
    if (hasUnsavedChanges.value) {
      error.value = '请先保存两个表单中的修改，再导入点位。'
      return
    }
    if (await commit(importPreview.value, 'import')) {
      importPreview.value = null
      deleted.value = null
    }
  }

  function invalidInput(key: string, message: string): void {
    inputErrors.value = produce(inputErrors.value, (errors) => { errors[key] = message })
    error.value = message
  }

  function clearInputValue(key: string): void {
    inputValues.value = produce(inputValues.value, (values) => { delete values[key] })
  }

  function clearInputError(key: string): void {
    inputErrors.value = produce(inputErrors.value, (errors) => { delete errors[key] })
  }

  return {
    confirmPosition, resetPositionConfirmation,
    availableFloors, pointLevelId, setLevel,
    continueAdding: shallowReadonly(continueAdding), canContinueAdding,
    setContinueAdding,
    recentPointTypes: shallowReadonly(recentPointTypes),
    positionInput: shallowReadonly(positionInput), arrivalInput: shallowReadonly(arrivalInput), updateCoordinateInput,
    hasUnsavedChanges, editorMode: shallowReadonly(editorMode), completePoints, allPoints, selectGravity, switchEditorTab,
    editing: shallowReadonly(editing), inputValues: shallowReadonly(inputValues), inputErrors: shallowReadonly(inputErrors),
    mapTileError: shallowReadonly(mapTileError), mapTileRetry: shallowReadonly(mapTileRetry),
    reportMapTileError: (failed: boolean) => { mapTileError.value = failed },
    retryMapTiles: () => { mapTileError.value = false; mapTileRetry.value += 1 },
    officialLibrary: shallowReadonly(officialLibrary),
    dataset: shallowReadonly(dataset), library: shallowReadonly(library), draft: shallowReadonly(draft), storage: shallowReadonly(storage),
    recovery: shallowReadonly(recovery), deleted: shallowReadonly(deleted), importPreview: shallowReadonly(importPreview),
    monsterSearch: shallowReadonly(monsterSearch), coordinateText: shallowReadonly(coordinateText), teleportCoordinateText: shallowReadonly(teleportCoordinateText),
    error: shallowReadonly(error), notice: shallowReadonly(notice), busy, operation: shallowReadonly(operation), dirty,
    setReferenceData, load, newPoint, selectPoint, setCoordinate, applyCoordinateText, setTeleportCoordinate, applyTeleportCoordinateText, selectState, initializeMapContext, addMember, setMemberCount, adjustMemberCount, removeMember,
    resetSession, savePoint, saveAllForms, discardAllForms, discardChanges, closeEditor, setPointType, setIcon, setIconUrl, clearTeleportCoordinate, deletePoint, undoDelete, recoverDraft, previewImport, applyImport,
    setMonsterSearch: (value: string) => { monsterSearch.value = value },
    setCoordinateText: (value: string) => { coordinateText.value = value },
    setTeleportCoordinateText: (value: string) => { teleportCoordinateText.value = value },
    setNote: (value: string) => edit((point) => { point.note = value }),
    setName: (value: string) => {
      if (busy.value || draft.value?.kind !== 'navigation') return
      const fixedName = draft.value.pointType ? navigationPointTypes[draft.value.pointType].names[0] : undefined
      if (fixedName !== undefined && value !== fixedName) return
      clearInputError('name')
      edit((point) => { if (point.kind === 'navigation') point.name = value })
    },
    setMode: (value: NavigationMode) => {
      if (busy.value || draft.value?.kind !== 'navigation') return
      const rule = draft.value.pointType ? navigationPointTypes[draft.value.pointType] : undefined
      if (rule?.teleportLocked) return
      const nonTeleportMode = rule?.defaultMode === 'fast-travel' ? 'landmark' : rule?.defaultMode ?? 'landmark'
      const mode = value === 'fast-travel' ? value : nonTeleportMode
      if (mode !== 'fast-travel') clearArrivalInput()
      edit((point) => {
        if (point.kind === 'navigation') {
          point.mode = mode
          if (mode !== 'fast-travel') delete point.teleportCoordinate
        }
      })
    },
    dismissDeleted: () => { deleted.value = null },
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
  }
})
