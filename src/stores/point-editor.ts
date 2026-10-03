import { emptyCoordinateInput, coordinateInputPending, commitCoordinateInput, coordinateAxes } from '../components/base/coordinate-input.ts'
import type { CoordinateInputState, CoordinateInputChange } from '../components/base/coordinate-input.ts'
import { useAssetsStore } from './assets.ts'
import { navigationIconAssets } from '../domain/navigation-icons.ts'
import { computed, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { freeze, produce } from 'immer'
import { authoredPointSchema, navigationPointTypeSchema } from '../domain/schema.ts'
import { emptyPointLibrary, parseCoordinateInput, parsePointLibrary } from '../domain/point-library.ts'
import type { AuthoredPoint, MapDataset, PointLibrary } from '../domain/types.ts'
import type { NavigationMode } from '../domain/types.ts'
import { combinePointLibraries } from '../domain/point-matching.ts'
import { readEditorLibrary, saveEditorLibrary } from '../data/editor-client.ts'
import { loadMapDataset } from '../data/load.ts'
import { hasGravityMap } from '../domain/gravity.ts'
import type { GravityType } from '../domain/types.ts'

const DRAFT_KEY = 'echo-map:point-editor:draft:v1'

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
  countryId?: number
  levelId?: string
  gravityType?: GravityType
}

export const usePointEditorStore = defineStore('point-editor', () => {
  const dataset = shallowRef<MapDataset | null>(null)
  const library = shallowRef<PointLibrary>(freeze(emptyPointLibrary(), true))
  const officialLibrary = shallowRef<PointLibrary>(freeze(emptyPointLibrary(), true))
  const mapTileError = shallowRef(false)
  const mapTileRetry = shallowRef(0)
  const revision = shallowRef('')
  const storage = shallowRef<'project' | 'browser'>('project')
  const editorMode = shallowRef<EditorKind>('echo')
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
  const allPoints = completePoints
  const hasUnsavedChanges = computed(() => Object.values(forms.value).some((form) => formDirty(form) || form.recovery !== null))

  function cacheDraft(): void {
    try {
      if (recovery.value) return
      if (draft.value && editing.value && dirty.value) localStorage.setItem(`${DRAFT_KEY}:${editorMode.value}`, JSON.stringify(draft.value))
      else localStorage.removeItem(`${DRAFT_KEY}:${editorMode.value}`)
    } catch {
      notice.value = '自动暂存不可用，请保存后再离开。'
    }
  }

  function openDraft(point: AuthoredPoint): void {
    resetCoordinateInput()
    resetCoordinateInput(true)
    draft.value = freeze(point, true)
    baseline.value = JSON.stringify(point)
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
    const context = draft.value
    cacheDraft()
    editorMode.value = kind
    error.value = ''
    notice.value = ''
    if (!draft.value) {
      newPoint(kind)
      if (context) initializeMapContext({ stateId: context.stateId, countryId: context.countryId ?? undefined, levelId: context.levelId ?? undefined, gravityType: context.gravityType ?? undefined })
    }
  }

  function newPoint(kind: AuthoredPoint['kind'] = editorMode.value): void {
    if (!canSwitch()) return
    const previous = draft.value
    editorMode.value = kind
    const base = {
      id: crypto.randomUUID(), status: 'draft' as const, stateId: previous?.stateId ?? (dataset.value?.states.some(({ id }) => id === 8) ? 8 : dataset.value?.states[0]?.id ?? 8),
      countryId: previous?.countryId ?? null, levelId: previous?.levelId ?? null,
      gravityType: previous?.gravityType ?? null,
      coordinate: { x: null, y: null, z: null }, note: '',
    }
    openDraft(kind === 'echo' ? { ...base, kind, compositionStatus: 'partial', members: [] } : { ...base, kind, name: '', navigationKind: 'unknown', mode: 'landmark' })
    error.value = ''
    cacheDraft()
  }

  function selectPoint(id: string): void {
    const point = completePoints.value.find((point) => point.id === id)
    if (!point || busy.value) return
    if (point.status === 'imported') {
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
    error.value = ''
    notice.value = ''
    cacheDraft()
  }

  function updateCoordinateInput(teleport: boolean, change: CoordinateInputChange): void {
    if (!draft.value || busy.value) return
    forms.value = produce(forms.value, (forms) => {
      const form = forms[editorMode.value]
      form[teleport ? 'arrivalInput' : 'positionInput'] = change.state
      const point = form.draft
      if (!point || (teleport && point.kind !== 'navigation')) return
      const previous = teleport && point.kind === 'navigation' ? point.teleportCoordinate : point.coordinate
      if (coordinateAxes.some((axis) => (previous?.[axis] ?? null) !== change.value[axis])) {
        if (teleport && point.kind === 'navigation') point.teleportCoordinate = change.value
        else point.coordinate = change.value
        point.status = 'draft'
      }
      for (const axis of coordinateAxes) {
        if (change.value[axis] === null || (change.state.text === null && change.state.axes[axis] === null)) continue
        const key = teleport ? `teleport:${axis}` : axis
        delete form.inputErrors[key]
        delete form.inputValues[key]
      }
    })
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
      point.status = 'draft'
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
        point.status = 'draft'
      })
    } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  }

  function setTeleportCoordinate(axis: 'x' | 'y' | 'z', value: string): void {
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
      point.status = 'draft'
    })
  }

  function applyTeleportCoordinateText(): void {
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
        point.status = 'draft'
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
      point.countryId = null
      point.levelId = null
      point.gravityType = null
      point.coordinate = { x: null, y: null, z: null }
      if (point.kind === 'navigation') delete point.teleportCoordinate
      point.status = 'draft'
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
    const countryIds = new Set(currentDataset.regionLabels
      .filter((label) => label.stateId === state.id && label.level === 1)
      .map(({ countryId }) => countryId))
    const floorIds = new Set(state.layeredMaps.flatMap(({ floors }) => floors.map(({ id }) => id)))
    openDraft(produce(currentDraft, (point) => {
      point.stateId = state.id
      point.countryId = context.countryId !== undefined && countryIds.has(context.countryId) ? context.countryId : null
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
        point.status = 'draft'
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
        point.status = 'draft'
      }
    })
  }

  function setReferenceData(reference: MapDataset, official: PointLibrary): void {
    dataset.value = freeze(reference, true)
    officialLibrary.value = freeze(official, true)
  }

  async function load(): Promise<void> {
    if (busy.value) return
    if (dataset.value && revision.value) {
      if (!draft.value) newPoint()
      return
    }
    operation.value = 'load'
    error.value = ''
    try {
      const [{ dataset: reference, officialLibrary: official }, snapshot] = await Promise.all([dataset.value ? { dataset: dataset.value, officialLibrary: officialLibrary.value } : loadMapDataset(), readEditorLibrary()])
      dataset.value = freeze(reference, true)
      library.value = freeze(parsePointLibrary(snapshot.library, reference), true)
      officialLibrary.value = freeze(official, true)
      revision.value = snapshot.revision
      storage.value = snapshot.storage
      for (const kind of ['echo', 'navigation'] as const) {
        if (forms.value[kind].draft) continue
        try {
          const cached = localStorage.getItem(`${DRAFT_KEY}:${kind}`)
          const parsed = cached ? authoredPointSchema.safeParse(JSON.parse(cached)) : null
          if (parsed?.success && parsed.data.kind === kind) {
            const validated = parsePointLibrary({ version: 1, points: [parsed.data] }, reference, 'manual').points[0]
            if (validated) forms.value = produce(forms.value, (state) => { state[kind].recovery = validated })
          }
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
      if (pendingRecovery) { try { localStorage.setItem(`${DRAFT_KEY}:${editorMode.value}`, JSON.stringify(pendingRecovery)) } catch { /* Recovery remains available in memory. */ } }
    }
  }

  async function commit(next: PointLibrary, action: 'save' | 'delete' | 'undo' | 'import'): Promise<boolean> {
    if (busy.value || !dataset.value || !revision.value) return false
    operation.value = action
    error.value = ''
    try {
      const libraryToSave = parsePointLibrary(next, dataset.value, 'manual')
      const snapshot = await saveEditorLibrary(libraryToSave, revision.value)
      library.value = freeze(snapshot.library, true)
      revision.value = snapshot.revision
      storage.value = snapshot.storage
      notice.value = storage.value === 'browser' ? '已保存到本机浏览器' : '已保存到本机文件'
      return true
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : String(failure)
      return false
    }
    finally { operation.value = null }
  }

  async function savePoint(): Promise<boolean> {
    if (!draft.value || !editing.value) return false
    const position = commitCoordinateInput(positionInput.value, draft.value.coordinate)
    updateCoordinateInput(false, position)
    const arrival = commitCoordinateInput(arrivalInput.value, draft.value.kind === 'navigation' ? draft.value.teleportCoordinate ?? { x: null, y: null, z: null } : { x: null, y: null, z: null })
    updateCoordinateInput(true, arrival)
    if (!position.valid || !arrival.valid) return false
    const errors = { ...inputErrors.value }
    for (const axis of ['x', 'y', 'z'] as const) {
      if (draft.value.coordinate[axis] === null) errors[axis] = '请填写整数坐标'
    }
    if (draft.value.kind === 'echo' && !draft.value.members.length) errors.members = '请添加至少一种声骸'
    if (draft.value.kind === 'navigation') {
      if (!draft.value.name.trim()) errors.name = '请填写名称'
      if (draft.value.navigationKind === 'unknown') errors.icon = '请选择图标'
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
    const saved = produce(draft.value, (point) => { point.status = 'verified' })
    const next = produce(library.value, (library) => {
      const index = library.points.findIndex(({ id }) => id === saved.id)
      if (index >= 0) library.points[index] = saved
      else library.points.push(saved)
    })
    if (await commit(next, 'save')) {
      openDraft(saved)
      recovery.value = null
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
      if (!await savePoint()) return false
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
    forms.value = { echo: emptyForm(), navigation: emptyForm() }
    editorMode.value = 'echo'
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

  function setPointType(value: string | number | null): void {
    const parsed = navigationPointTypeSchema.safeParse(value)
    if (value !== null && !parsed.success) return
    edit((point) => {
      if (point.kind !== 'navigation') return
      if (parsed.success) point.pointType = parsed.data
      else delete point.pointType
      point.status = 'draft'
    })
  }

  function setIcon(sourceId: string): void {
    const source = dataset.value?.navigationPoints.find(({ id }) => id === sourceId)
    if (!source) return
    clearInputError('icon')
    edit((point) => {
      if (point.kind !== 'navigation') return
      delete point.iconUrl
      point.iconSourceId = source.id
      const group = dataset.value?.navigationPointGroups.find(({ id }) => id === source.groupId)
      if (!group?.kinds.includes(point.navigationKind)) point.navigationKind = source.kind
      if (point.mode === 'unknown' || ['boss', 'domain', 'challenge'].includes(point.navigationKind)) point.mode = 'fast-travel'
    })
  }

  function setAssetIcon(id: string): void {
    const asset = navigationIconAssets(useAssetsStore().assets).find((asset) => asset.id === id)
    if (!asset || busy.value || draft.value?.kind !== 'navigation') return
    const names = asset.name.split(' / ').map((name) => name.trim()).filter(Boolean)
    const automaticName = names.length === 1 ? names[0] : undefined
    if (automaticName) clearInputError('name')
    const source = dataset.value?.navigationPoints.find((point) => [asset.url, ...asset.tags].includes(point.iconUrl))
    if (source) setIcon(source.id)
    clearInputError('icon')
    edit((point) => {
      if (point.kind !== 'navigation') return
      if (!source) {
        delete point.iconSourceId
        point.navigationKind = asset.categories.includes('service') ? 'service' : 'landmark'
      }
      if (automaticName) point.name = automaticName
      point.iconUrl = asset.url
      point.status = 'draft'
    })
  }

  function clearTeleportCoordinate(): void {
    resetCoordinateInput(true)
    for (const axis of ['x', 'y', 'z']) {
      clearInputError(`teleport:${axis}`)
      clearInputValue(`teleport:${axis}`)
    }
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
    resetSession, savePoint, saveAllForms, discardAllForms, discardChanges, closeEditor, setPointType, setIcon, setAssetIcon, clearTeleportCoordinate, deletePoint, undoDelete, recoverDraft, previewImport, applyImport,
    setMonsterSearch: (value: string) => { monsterSearch.value = value },
    setCoordinateText: (value: string) => { coordinateText.value = value },
    setTeleportCoordinateText: (value: string) => { teleportCoordinateText.value = value },
    setLevel: (value: string | null) => edit((point) => {
      point.levelId = value
      point.status = 'draft'
    }),
    setCountry: (value: number | null) => edit((point) => { point.countryId = value }),
    setNote: (value: string) => edit((point) => { point.note = value }),
    setName: (value: string) => {
      clearInputError('name')
      edit((point) => { if (point.kind === 'navigation') point.name = value })
    },
    setMode: (value: NavigationMode) => {
      if (value !== 'fast-travel') {
        resetCoordinateInput(true)
        for (const axis of ['x', 'y', 'z']) {
          clearInputError(`teleport:${axis}`)
          clearInputValue(`teleport:${axis}`)
        }
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
