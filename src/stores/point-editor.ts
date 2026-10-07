import { emptyCoordinateInput, coordinateInputPending, coordinateInputXY, coordinateInputPartialXY, commitCoordinateInput, coordinateAxes } from '../components/base/coordinate-input.ts'
import type { CoordinateInputState, CoordinateInputChange } from '../components/base/coordinate-input.ts'
import { navigationIconById, navigationTypeIcons } from '../domain/navigation-icons.ts'
import { navigationPointTypes } from '../domain/navigation-point-types.ts'
import { computed, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { freeze, produce } from 'immer'
import { navigationPointTypeSchema, pointTransferSchema } from '../domain/schema.ts'
import { emptyPointLibrary, isOfficialPoint, parseCoordinateInput, parsePointLibrary } from '../domain/point-library.ts'
import type { AuthoredPoint, MapDataset, PointLibrary, PointLibraryRevision, PointWorkspace } from '../domain/types.ts'
import { editWorkspace, managementRows, parsePointWorkspace, pointExportFilename, projectManagementRows, resolveWorkspace, samePoint, workspaceLibrary } from '../domain/local-points.ts'
import type { NavigationMode } from '../domain/types.ts'
import { combinePointLibraries, findPointDuplicates } from '../domain/point-matching.ts'
import { readEditorLibrary, saveEditorLibrary } from '../data/editor-client.ts'
import { loadMapDataset } from '../data/load.ts'
import { hasGravityMap } from '../domain/gravity.ts'
import { useExplorerStore } from './explorer.ts'
import { hitsMapTile } from '../map/tile-coverage.ts'
import { useEqualComputed } from '../composables/useEqualComputed.ts'

const CONTINUE_ADDING_KEY = 'echo-map:point-editor:continue-adding:v1'
const RECENT_ICONS_KEY = 'echo-map:point-editor:recent-icons:v1'
const RECENT_ICONS_LIMIT = 30
const RECENT_NAMES_KEY = 'echo-map:point-editor:recent-names:v1'
const RECENT_NAMES_LIMIT = 10
const POSITION_CONFIRM_INTERVAL = 600

type EditorKind = AuthoredPoint['kind']
type EditorDraftOf<T> = T extends AuthoredPoint ? Omit<T, 'stateId' | 'gravityType' | 'levelId'> & { levelId?: string | null } : never
type EditorDraft = EditorDraftOf<AuthoredPoint>

function formPoint(point: AuthoredPoint | EditorDraft): EditorDraft {
  if ('stateId' in point) {
    const { stateId: _state, gravityType: _gravity, ...fields } = point
    return fields
  }
  return point
}
interface EditorForm {
  positionInput: CoordinateInputState
  arrivalInput: CoordinateInputState
  draft: EditorDraft | null
  baseline: string
  monsterSearch: string
  coordinateText: string
  teleportCoordinateText: string
  inputValues: Record<string, string>
  inputErrors: Record<string, string>
}
function emptyForm(): EditorForm {
  return { positionInput: emptyCoordinateInput(), arrivalInput: emptyCoordinateInput(), draft: null, baseline: '', monsterSearch: '', coordinateText: '', teleportCoordinateText: '', inputValues: {}, inputErrors: {} }
}
function formDirty(form: EditorForm): boolean {
  return form.draft !== null && (JSON.stringify(form.draft) !== form.baseline || Object.keys(form.inputErrors).length > 0 || coordinateInputPending(form.positionInput) || coordinateInputPending(form.arrivalInput))
}

export const usePointEditorStore = defineStore('point-editor', () => {
  const explorer = useExplorerStore()
  const dataset = shallowRef<MapDataset | null>(null)
  const library = shallowRef<PointLibrary>(freeze(emptyPointLibrary(), true))
  const workspace = shallowRef<PointWorkspace | null>(null)
  const importWorkspace = shallowRef<PointWorkspace | null>(null)
  const importReplaceAll = shallowRef(true)
  const importLabel = shallowRef('替换全部人工点位')
  const managedPoints = computed(() => freeze(workspace.value ? managementRows(workspace.value) : projectManagementRows(library.value), true))
  const officialLibrary = shallowRef<PointLibrary>(freeze(emptyPointLibrary(), true))
  const mapTileError = shallowRef(false)
  const mapTileRetry = shallowRef(0)
  const revision = shallowRef<PointLibraryRevision | null>(null)
  const storage = shallowRef<'project' | 'browser'>('project')
  const editorMode = shallowRef<EditorKind>('navigation')
  const continueAdding = shallowRef(false)
  const recentIconIds = shallowRef<readonly string[]>([])
  let recentIconsRestored = false
  const recentNames = shallowRef<readonly string[]>([])
  let recentNamesRestored = false
  const positionConfirmation = shallowRef<{ snapshot: string, pressedAt: number } | null>(null)
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
  const fields = formField('draft')
  const pointState = computed(() => dataset.value?.states.find(({ id }) => id === explorer.selectedStateId) ?? null)
  const availableFloors = useEqualComputed(() => {
    const coordinate = fields.value ? coordinateInputXY(positionInput.value, fields.value.coordinate) : null
    const state = pointState.value
    if (!coordinate || !state) return []
    // Editing uses the same tile bounds as saving, including transparent image regions.
    return state.layeredMaps.flatMap(({ floors }) => floors)
      .filter(({ id }) => hitsMapTile(state, dataset.value?.source.tileWidth ?? 1024, coordinate, null, id))
      .map(({ id, name }) => ({ id, name }))
  })
  const pointLevelId = computed(() => {
    const requested = fields.value?.levelId === undefined ? explorer.selectedLevelId : fields.value.levelId
    return availableFloors.value.some(({ id }) => id === requested) ? requested : null
  })
  // Resolve map context on demand for preview, duplicate checks and persistence.
  const draft = computed<AuthoredPoint | null>(() => fields.value ? freeze({
    ...fields.value,
    stateId: explorer.selectedStateId,
    gravityType: hasGravityMap(pointState.value) ? explorer.selectedGravity : null,
    levelId: pointLevelId.value,
  }, true) : null)
  const completePoints = computed(() => freeze(combinePointLibraries(library.value, officialLibrary.value), true).points)
  const tileErrors = computed(() => {
    const point = draft.value
    if (!point) return { position: '', arrival: '' }
    const reference = dataset.value
    const state = pointState.value
    if (!reference || !state) return { position: '地图数据未就绪，暂时无法保存', arrival: '' }
    const position = coordinateInputPartialXY(positionInput.value, point.coordinate)
    const arrival = point.kind === 'navigation' && point.mode === 'fast-travel'
      ? coordinateInputPartialXY(arrivalInput.value, point.teleportCoordinate ?? { x: null, y: null, z: null }) : null
    function message(coordinate: readonly [number | null, number | null] | null, prefix: string, levelId: string | null = null): string {
      if (!coordinate?.some((value) => value !== null) || !state || !reference || !point
        || hitsMapTile(state, reference.source.tileWidth, coordinate, point.gravityType, levelId)) return ''
      const axes = coordinate[0] === null ? 'Y' : coordinate[1] === null ? 'X' : 'XY'
      return `${prefix} ${axes} 未命中所选地图的瓦片，请检查坐标或切换地图`
    }
    return {
      position: message(position, '当前', point.levelId),
      arrival: message(arrival, '传送落点'),
    }
  })
  const tileSaveBlocked = computed(() => !dataset.value || !pointState.value || Boolean(tileErrors.value.position || tileErrors.value.arrival))
  const baseline = formField('baseline')
  const importPreview = shallowRef<PointLibrary | null>(null)
  const monsterSearch = formField('monsterSearch')
  const coordinateText = formField('coordinateText')
  const teleportCoordinateText = formField('teleportCoordinateText')
  const error = shallowRef('')
  const notice = shallowRef('')
  const operation = shallowRef<'load' | 'save' | 'delete' | 'import' | 'manage' | null>(null)
  const busy = computed(() => operation.value !== null)
  const inputErrors = formField('inputErrors')
  const inputValues = formField('inputValues')
  const dirty = computed(() => formDirty(forms.value[editorMode.value]))
  const editing = computed(() => draft.value !== null)
  const canContinueAdding = computed(() => draft.value?.kind === 'navigation'
    && !draft.value.replacesOfficialIds?.length
    && !library.value.points.some(({ id }) => id === draft.value?.id))
  const allPoints = completePoints
  const duplicateTarget = computed(() => {
    const point = draft.value
    if (!point) return null
    const xy = coordinateInputXY(positionInput.value, point.coordinate)
    if (!xy) return null
    const committed = commitCoordinateInput(positionInput.value, point.coordinate)
    return freeze({ ...point, coordinate: { x: xy[0], y: xy[1], z: committed.valid ? committed.value.z : null } }, true)
  })
  const duplicateCandidates = computed(() => freeze(duplicateTarget.value ? findPointDuplicates(allPoints.value, duplicateTarget.value) : [], true))
  const duplicateConfirmation = shallowRef(false)
  let resolveDuplicate: ((confirmed: boolean) => void) | null = null
  function confirmDuplicate(confirmed: boolean): void {
    duplicateConfirmation.value = false
    const resolve = resolveDuplicate
    resolveDuplicate = null
    resolve?.(confirmed)
  }
  const hasUnsavedChanges = computed(() => Object.values(forms.value).some(formDirty))

  function openDraft(point: AuthoredPoint | EditorDraft): void {
    resetPositionConfirmation()
    resetCoordinateInput()
    resetCoordinateInput(true)
    fields.value = freeze(formPoint(point), true)
    reconcilePointLevel()
    baseline.value = JSON.stringify(fields.value)
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
    editorMode.value = kind
    error.value = ''
    notice.value = ''
    if (!draft.value) {
      newPoint(kind)
    }
  }

  function newPoint(kind: AuthoredPoint['kind'] = editorMode.value): void {
    if (!canSwitch()) return
    editorMode.value = kind
    const base = {
      id: crypto.randomUUID(),
      coordinate: { x: null, y: null, z: null }, note: '',
    }
    openDraft(kind === 'echo' ? { ...base, kind, compositionStatus: 'partial', members: [] } : { ...base, kind, name: '', navigationKind: 'landmark', mode: 'landmark' })
    error.value = ''
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
    if (explorer.selectedStateId !== point.stateId) explorer.selectState(point.stateId)
    explorer.selectGravity(point.gravityType ?? 1)
    openDraft(point)
    error.value = ''
  }

  function edit(recipe: (point: EditorDraft) => void): void {
    if (!fields.value || busy.value) return
    fields.value = freeze(produce(fields.value, recipe), true)
    reconcilePointLevel()
    error.value = ''
    notice.value = ''
  }

  function reconcilePointLevel(): void {
    const point = fields.value
    if (!point?.levelId || !coordinateInputXY(positionInput.value, point.coordinate)
      || availableFloors.value.some(({ id }) => id === point.levelId)) return
    fields.value = freeze(produce(point, (point) => { point.levelId = null }), true)
  }

  function resetMapDependentFields(): void {
    resetPositionConfirmation()
    forms.value = produce(forms.value, (forms) => {
      for (const kind of ['echo', 'navigation'] as const) {
        const form = forms[kind]
        if (!form.draft) continue
        const pristineNew = !formDirty(form) && !library.value.points.some(({ id }) => id === form.draft?.id)
        form.draft.levelId = null
        if (pristineNew) form.baseline = JSON.stringify(form.draft)
      }
    })
  }

  function setLevel(value: string | number | null): void {
    if (busy.value || !draft.value || typeof value === 'number'
      || value !== null && !availableFloors.value.some(({ id }) => id === value)
      || value === fields.value?.levelId) return
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
    if (tileSaveBlocked.value) {
      resetPositionConfirmation()
      error.value = tileErrors.value.position || tileErrors.value.arrival
      return 'wait'
    }
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

  function restoreRecentIcons(): void {
    if (recentIconsRestored) return
    recentIconsRestored = true
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(RECENT_ICONS_KEY) ?? '[]')
      if (!Array.isArray(saved)) return
      const ids = saved.filter((id): id is string => typeof id === 'string' && Boolean(navigationIconById(id)))
      recentIconIds.value = Object.freeze([...new Set(ids)].slice(0, RECENT_ICONS_LIMIT))
    } catch { /* Ignore invalid or unavailable local preferences. */ }
  }

  function setContinueAdding(value: boolean): void {
    if (busy.value) return
    continueAdding.value = value
    try { localStorage.setItem(CONTINUE_ADDING_KEY, String(value)) }
    catch { /* The preference remains available for this session. */ }
  }

  function restoreRecentNames(): void {
    if (recentNamesRestored) return
    recentNamesRestored = true
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(RECENT_NAMES_KEY) ?? '[]')
      if (!Array.isArray(saved)) return
      const names = saved.filter((name): name is string => typeof name === 'string').map(name => name.trim()).filter(Boolean)
      recentNames.value = Object.freeze([...new Set(names)].slice(0, RECENT_NAMES_LIMIT))
    } catch { /* Ignore invalid or unavailable local preferences. */ }
  }

  function persistRecentNames(): void {
    try { localStorage.setItem(RECENT_NAMES_KEY, JSON.stringify(recentNames.value)) }
    catch { /* Recent names remain available for this session. */ }
  }

  function recordManualName(value: string): void {
    restoreRecentNames()
    const name = value.trim()
    if (!name) return
    recentNames.value = produce(recentNames.value, (names) => {
      const index = names.indexOf(name)
      if (index !== -1) names.splice(index, 1)
      names.unshift(name)
      names.splice(RECENT_NAMES_LIMIT)
    })
    persistRecentNames()
  }

  function removeRecentName(name: string): void {
    recentNames.value = produce(recentNames.value, (names) => {
      const index = names.indexOf(name)
      if (index !== -1) names.splice(index, 1)
    })
    persistRecentNames()
  }

  async function load(kind: EditorKind = editorMode.value): Promise<void> {
    if (busy.value) return
    restoreContinueAdding()
    restoreRecentIcons()
    restoreRecentNames()
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
      workspace.value = snapshot.workspace ? freeze(parsePointWorkspace(snapshot.workspace, reference), true) : null
      notice.value = ''
    } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
    finally { operation.value = null }
    if (dataset.value && revision.value && !draft.value) newPoint()
  }

  async function commit(next: PointLibrary, action: 'save' | 'delete' | 'import' | 'manage', nextWorkspace?: PointWorkspace): Promise<boolean> {
    if (busy.value || !dataset.value || !revision.value) return false
    operation.value = action
    error.value = ''
    notice.value = ''
    try {
      const libraryToSave = parsePointLibrary(next, dataset.value, 'manual')
      const snapshot = await saveEditorLibrary(libraryToSave, revision.value, library.value, action === 'import' && importReplaceAll.value, nextWorkspace)
      library.value = freeze(snapshot.library, true)
      revision.value = snapshot.revision
      storage.value = snapshot.storage
      workspace.value = snapshot.workspace ? freeze(snapshot.workspace, true) : null
      notice.value = action === 'save' ? '保存成功' : action === 'delete' ? '点位已删除' : storage.value === 'browser' ? '已保存到本机浏览器' : '已保存到本机文件'
      return true
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : String(failure)
      return false
    }
    finally { operation.value = null }
  }

  async function savePoint(options: { continueAdding?: boolean } = {}): Promise<boolean> {
    if (!draft.value || !editing.value || busy.value || duplicateConfirmation.value) return false
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
      if (!draft.value.iconId) errors.icon = '请选择图标'
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
    if (tileSaveBlocked.value) {
      error.value = tileErrors.value.position || tileErrors.value.arrival || '地图数据未就绪，暂时无法保存'
      return false
    }
    const saved = draft.value
    if (findPointDuplicates(allPoints.value, saved).some(({ suspicious }) => suspicious)) {
      const snapshot = JSON.stringify(saved)
      const pointsSnapshot = allPoints.value
      duplicateConfirmation.value = true
      const confirmed = await new Promise<boolean>((resolve) => { resolveDuplicate = resolve })
      if (!confirmed) return false
      if (JSON.stringify(draft.value) !== snapshot || pointsSnapshot !== allPoints.value) return savePoint(options)
    }
    const next = produce(library.value, (library) => {
      const index = library.points.findIndex(({ id }) => id === saved.id)
      if (index >= 0) library.points[index] = saved
      else library.points.push(saved)
    })
    if (await commit(next, 'save')) {
      openDraft({ ...formPoint(saved), levelId: fields.value?.levelId })
      if (addNext && saved.kind === 'navigation') {
        newPoint('navigation')
        setPointType(saved.pointType ?? null)
        if (draft.value?.kind === 'navigation') {
          openDraft(produce(draft.value, (point) => {
            point.name = saved.name
            if (saved.iconId) point.iconId = saved.iconId
          }))
        }
        notice.value = '保存成功'
      }
      return true
    }
    return false
  }

  async function saveAllForms(): Promise<boolean> {
    const previous = editorMode.value
    for (const kind of ['echo', 'navigation'] as const) {
      if (!formDirty(forms.value[kind])) continue
      switchEditorTab(kind)
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
      baseline.value = JSON.stringify(fields.value)
      newPoint(draft.value?.kind)
    }
    error.value = ''
    notice.value = ''
  }

  function resetSession(): void {
    if (busy.value) return
    confirmDuplicate(false)
    resetPositionConfirmation()
    forms.value = { echo: emptyForm(), navigation: emptyForm() }
    editorMode.value = 'navigation'
    importPreview.value = null
    error.value = ''
    notice.value = ''
  }

  function closeEditor(): void {
    if (busy.value) return
    discardChanges()
    newPoint()
  }

  function setPointType(value: string | number | null): void {
    if (busy.value || draft.value?.kind !== 'navigation') return
    const parsed = navigationPointTypeSchema.safeParse(value)
    if (value !== null && !parsed.success) return
    if (draft.value.pointType === (parsed.success ? parsed.data : undefined)) return
    const rule = parsed.success ? navigationPointTypes[parsed.data] : undefined
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
      if (rule) point.name = rule.names[0] ?? rule.name
      if (parsed.success) point.pointType = parsed.data
      else delete point.pointType
      point.navigationKind = rule?.kind ?? 'landmark'
      point.mode = mode
      delete point.iconId
      if (icon) point.iconId = icon.id
      if (point.mode !== 'fast-travel') delete point.teleportCoordinate
    })
  }

  function setIcon(id: string): void {
    if (busy.value || draft.value?.kind !== 'navigation') return
    const icon = navigationTypeIcons(draft.value.pointType).find((icon) => icon.id === id)
    if (!icon) return
    recentIconIds.value = produce(recentIconIds.value, (ids) => {
      const index = ids.indexOf(id)
      if (index !== -1) ids.splice(index, 1)
      ids.unshift(id)
      ids.splice(RECENT_ICONS_LIMIT)
    })
    try { localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(recentIconIds.value)) }
    catch { /* Recent icons remain available for this session. */ }
    const names = icon.name.split(' / ')
    const rule = draft.value.pointType ? navigationPointTypes[draft.value.pointType] : undefined
    const name = rule?.names[0] ?? (names.length === 1 ? names[0] : undefined)
    clearInputError('icon')
    if (name !== undefined) clearInputError('name')
    edit((point) => {
      if (point.kind !== 'navigation') return
      point.iconId = icon.id
      if (name !== undefined) point.name = name
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
      baseline.value = JSON.stringify(fields.value)
      inputErrors.value = {}
      newPoint(point.kind)
    }
  }

  function previewImport(text: string): void {
    if (!dataset.value || !canSwitch()) return
    importPreview.value = null
    importWorkspace.value = null
    importReplaceAll.value = true
    try {
      const value: unknown = JSON.parse(text)
      const transfer = pointTransferSchema.safeParse(value)
      let incoming: PointLibrary
      if (transfer.success) {
        const data = transfer.data
        if (data.format === 'point-backup') {
          if (!workspace.value) throw new Error('本地备份只能在浏览器存储模式恢复；提交项目请使用“导出修改”。')
          const restored = { ...data.workspace, published: workspace.value.published }
          parsePointWorkspace(restored, dataset.value)
          importWorkspace.value = freeze(restored, true)
          incoming = workspaceLibrary(restored)
          importLabel.value = '恢复本地备份，并与当前网站数据对比'
        } else {
          if (data.changes.some(change => change.needsReview)) throw new Error('修改文件包含未确认的旧数据，请先确认后重新导出。')
          const points = new Map(library.value.points.map(point => [point.id, point]))
          for (const change of data.changes) {
            for (const point of [change.before, change.after]) if (point) parsePointLibrary({ version: 1, points: [point] }, dataset.value, 'manual')
            const current = points.get(change.id) ?? null
            if (samePoint(current, change.after)) continue
            if (!samePoint(current, change.before)) throw new Error(`点位 ${change.id} 与当前数据有冲突，请先在管理界面核对。未导入任何修改。`)
            if (change.after) points.set(change.id, change.after)
            else points.delete(change.id)
          }
          incoming = { version: 1, points: [...points.values()] }
          if (workspace.value) {
            importWorkspace.value = freeze(editWorkspace(workspace.value, incoming), true)
          }
          importReplaceAll.value = false
          importLabel.value = '合并文件中的点位修改，其余点位保留'
        }
      } else {
        incoming = parsePointLibrary(value, dataset.value, 'manual')
        importLabel.value = '替换全部人工点位'
      }
      incoming = parsePointLibrary(incoming, dataset.value, 'manual')
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
    const previous = library.value
    if (await commit(importPreview.value, 'import', importWorkspace.value ?? undefined)) {
      importPreview.value = null
      importWorkspace.value = null
      refreshSavedForms(previous)
    }
  }

  function refreshSavedForms(previous: PointLibrary): void {
    const savedIds = new Set(previous.points.map(point => point.id))
    const current = new Map(library.value.points.map(point => [point.id, point]))
    forms.value = produce(forms.value, forms => {
      for (const kind of ['echo', 'navigation'] as const) {
        const point = forms[kind].draft
        if (!point || !savedIds.has(point.id)) continue
        const saved = current.get(point.id)
        if (saved && JSON.stringify(point) === JSON.stringify(formPoint(saved))) continue
        forms[kind] = saved ? { ...emptyForm(), draft: formPoint(saved), baseline: JSON.stringify(formPoint(saved)) } : emptyForm()
      }
    })
    if (!draft.value) newPoint()
  }

  async function refreshPublishedPoints(): Promise<boolean> {
    if (busy.value || hasUnsavedChanges.value) return false
    operation.value = 'load'
    error.value = ''
    try {
      const snapshot = await readEditorLibrary()
      if (!dataset.value) return false
      library.value = freeze(parsePointLibrary(snapshot.library, dataset.value, 'manual'), true)
      workspace.value = snapshot.workspace ? freeze(parsePointWorkspace(snapshot.workspace, dataset.value), true) : null
      revision.value = snapshot.revision
      storage.value = snapshot.storage
      forms.value = { echo: emptyForm(), navigation: emptyForm() }
      notice.value = '已检查最新点位数据'
      return true
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : String(failure)
      return false
    } finally { operation.value = null; if (!draft.value) newPoint() }
  }

  async function managePoints(ids: readonly string[], action: 'delete' | 'published' | 'local' | 'cleanup'): Promise<boolean> {
    if (busy.value || hasUnsavedChanges.value || ids.length === 0) return false
    const selected = new Set(ids)
    let nextWorkspace = workspace.value ?? undefined
    let next = library.value
    if (action === 'delete') {
      next = produce(next, draft => { draft.points = draft.points.filter(point => !selected.has(point.id)) })
      if (nextWorkspace) nextWorkspace = editWorkspace(nextWorkspace, next)
    } else {
      if (!nextWorkspace) return false
      nextWorkspace = resolveWorkspace(nextWorkspace, ids, action)
      next = workspaceLibrary(nextWorkspace)
    }
    if (!await commit(next, 'manage', nextWorkspace)) return false
    forms.value = { echo: emptyForm(), navigation: emptyForm() }
    newPoint()
    return true
  }

  function createPointExport(kind: EditorKind, ids?: readonly string[], backup = false): { filename: string; data: unknown } | null {
    if (busy.value) return null
    const now = new Date()
    const exportedAt = now.toISOString()
    if (backup) return {
      filename: pointExportFilename('本地点位备份', now),
      data: workspace.value ? { format: 'point-backup', version: 1, exportedAt, workspace: workspace.value } : library.value,
    }
    const selected = ids ? new Set(ids) : null
    const rows = managedPoints.value.filter(row => row.point.kind === kind && (!selected || selected.has(row.id)))
    const title = kind === 'navigation' ? '定位点' : '声骸点位'
    if (!workspace.value) return { filename: pointExportFilename(title, now), data: { version: 1, points: rows.flatMap(row => row.local ? [row.local] : []) } }
    const changed = rows.filter(row => row.status !== 'published' && row.status !== 'adopted')
    if (!changed.length) { error.value = '当前范围没有可导出的本地修改'; return null }
    if (changed.some(row => row.status === 'conflict' || row.status === 'review')) {
      error.value = '请先处理所选范围内的冲突和待确认记录，再导出修改；完整备份仍可导出。'
      return null
    }
    const changedIds = new Set(changed.map(row => row.id))
    return { filename: pointExportFilename(`${title}修改`, now), data: { format: 'point-changes', version: 1, exportedAt, changes: workspace.value.changes.filter(change => changedIds.has(change.id)) } }
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
    tileErrors: shallowReadonly(tileErrors), tileSaveBlocked: shallowReadonly(tileSaveBlocked),
    workspace: shallowReadonly(workspace), managedPoints, managePoints, refreshPublishedPoints, createPointExport, importLabel: shallowReadonly(importLabel),
    confirmPosition, resetPositionConfirmation,
    duplicateTarget, duplicateCandidates, duplicateConfirmation: shallowReadonly(duplicateConfirmation), confirmDuplicate,
    availableFloors, pointLevelId, setLevel, resetMapDependentFields,
    recentIconIds: shallowReadonly(recentIconIds),
    recentNames: shallowReadonly(recentNames), recordManualName, removeRecentName,
    continueAdding: shallowReadonly(continueAdding), canContinueAdding,
    setContinueAdding,
    positionInput: shallowReadonly(positionInput), arrivalInput: shallowReadonly(arrivalInput), updateCoordinateInput,
    hasUnsavedChanges, editorMode: shallowReadonly(editorMode), completePoints, allPoints, switchEditorTab,
    editing: shallowReadonly(editing), inputValues: shallowReadonly(inputValues), inputErrors: shallowReadonly(inputErrors),
    mapTileError: shallowReadonly(mapTileError), mapTileRetry: shallowReadonly(mapTileRetry),
    reportMapTileError: (failed: boolean) => { mapTileError.value = failed },
    retryMapTiles: () => { mapTileError.value = false; mapTileRetry.value += 1 },
    officialLibrary: shallowReadonly(officialLibrary),
    dataset: shallowReadonly(dataset), library: shallowReadonly(library), draft: shallowReadonly(draft), storage: shallowReadonly(storage),
    importPreview: shallowReadonly(importPreview),
    monsterSearch: shallowReadonly(monsterSearch), coordinateText: shallowReadonly(coordinateText), teleportCoordinateText: shallowReadonly(teleportCoordinateText),
    error: shallowReadonly(error), notice: shallowReadonly(notice), busy, operation: shallowReadonly(operation), dirty,
    setReferenceData, load, newPoint, selectPoint, setCoordinate, applyCoordinateText, setTeleportCoordinate, applyTeleportCoordinateText, addMember, setMemberCount, adjustMemberCount, removeMember,
    resetSession, savePoint, saveAllForms, discardAllForms, discardChanges, closeEditor, setPointType, setIcon, clearTeleportCoordinate, deletePoint, previewImport, applyImport,
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
    cancelImport: () => { importPreview.value = null; importWorkspace.value = null },
    reportError: (value: string) => { error.value = value },
    dismissMessage: () => {
      error.value = ''
      notice.value = ''
    },
  }
})
