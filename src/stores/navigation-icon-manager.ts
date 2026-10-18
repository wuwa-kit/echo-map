import { useMessageStore } from './message.ts'
import { computed, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Draft } from 'immer'
import type { NavigationIconLibrary } from '../domain/types.ts'
import { freeze, produce } from 'immer'
import { z } from 'zod'
import { useNavigationIconLibraryStore } from './navigation-icon-library.ts'
import { categoryMoveOrder, compareIconPosition, iconDisplayName, navigationIconLibrarySchema } from '../domain/navigation-icon-library.ts'
import { readNavigationIconLibrary, saveNavigationIconLibrary } from '../data/navigation-icon-client.ts'
import { builtInIconType, builtInNavigationIconCategories } from '../domain/navigation-point-types.ts'
import { echoCatalogCosts, iconSources } from '../domain/navigation-icon-pool.ts'
import type { IconSource } from '../domain/navigation-icon-pool.ts'
import type { IconRemovalResolution } from '../domain/icon-removal.ts'

export const iconFilterSchema = z.enum(['all', 'unnamed'])
const usageSchema = z.object({ points: z.array(z.object({ id: z.string(), name: z.string().optional(), iconId: z.string().optional(), stateId: z.number() })) })
type Usage = z.infer<typeof usageSchema>['points']
export interface IconQueryBinding { read: () => Record<string, unknown>; write: (query: Record<string, unknown>) => void }

type Filters = { view: 'categories' | 'icons'; source: 'all' | IconSource; status: z.infer<typeof iconFilterSchema>; selectedId: string | null; category: string }

export const useNavigationIconManagerStore = defineStore('navigation-icon-manager', () => {
  const library = useNavigationIconLibraryStore()
  const queryBinding = shallowRef<IconQueryBinding | null>(null)
  function bindQuery(binding: IconQueryBinding): void { queryBinding.value = binding }
  function unbindQuery(binding: IconQueryBinding): void { if (queryBinding.value === binding) queryBinding.value = null }
  const filters = computed<Filters>({
    get: () => parseQuery(queryBinding.value?.read() ?? {}),
    set: value => queryBinding.value?.write({
      view: value.view, source: value.source,
      status: value.status, icon: value.selectedId ?? undefined, category: value.category,
    }),
  })
  const categoryInput = shallowRef('')
  const createCategoryOpen = shallowRef(false)
  function openCreateCategory(): void {
    if (!editable.value || busy.value || saving.value) return
    categoryInput.value = ''
    createCategoryOpen.value = true
  }
  function closeCreateCategory(): void {
    createCategoryOpen.value = false
    categoryInput.value = ''
  }
  async function saveNewCategory(): Promise<void> {
    if (!editable.value || busy.value || saving.value || !createCategoryOpen.value) return
    const name = categoryInput.value.trim()
    if (!name || library.draft.categories.some(category => category.name === name)) { reportError('分类名称不能为空或重复'); return }
    const id = 'category-' + crypto.randomUUID()
    const order = Math.max(0, ...library.draft.categories.map(category => category.order ?? 0)) + 1024
    if (await persistOperation(next => { next.categories.push({ id, name, order, icons: [] }) })) {
      closeCreateCategory()
      setCategory(id)
    }
  }
  const addingCategoryId = shallowRef<string | null>(null)
  const addingOpen = shallowRef(false)
  const addingIds = shallowRef<string[]>([])
  const addingSource = shallowRef<'all' | IconSource>('all')
  const addingEchoCost = shallowRef<1 | 3 | null>(null)
  const addingEchoCostVisible = computed(() => addingSource.value === 'echo-catalog' || addingCategoryId.value === 'category-special-boss')
  const addingCategory = computed(() => library.saved.categories.find(category => category.id === addingCategoryId.value) ?? null)
  const addingMemberIds = computed(() => new Set([...library.saved.categories.flatMap(category => category.icons.map(member => member.iconId)), ...library.pool.filter(icon => (builtInIconType(icon.id)?.icons.length ?? 0) > 1).map(icon => icon.id)]))
  const addingIcons = computed(() => library.savedPool.filter(icon =>
    icon.source !== 'placeholder' && (addingCategoryId.value !== 'category-special-boss' || icon.source === 'echo-catalog') && (addingSource.value === 'all' || icon.source === addingSource.value)
    && (!addingEchoCostVisible.value || addingEchoCost.value === null || echoCatalogCosts.get(icon.id) === addingEchoCost.value)
    && (iconDisplayName(icon) + ' ' + icon.id).toLocaleLowerCase().includes(memberSearch.value.trim().toLocaleLowerCase()),
  ).toSorted(compareIconPosition))
  function openAddIcons(): void {
    if (!editable.value || busy.value || saving.value || !activeCategory.value) return
    addingCategoryId.value = activeCategory.value.id
    addingIds.value = []
    addingSource.value = 'all'
    addingEchoCost.value = null
    memberSearch.value = ''
    addingOpen.value = true
  }
  function closeAddIcons(): void {
    if (saving.value) return
    addingOpen.value = false
  }
  function finishCloseAddIcons(): void {
    if (addingOpen.value) return
    addingCategoryId.value = null
    addingIds.value = []
    addingSource.value = 'all'
    addingEchoCost.value = null
    memberSearch.value = ''
  }
  function setAddingSource(source: 'all' | IconSource): void { if (!saving.value) addingSource.value = source }
  function setAddingEchoCost(cost: 1 | 3 | null): void { if (!saving.value) addingEchoCost.value = cost }
  function clearAddingSelection(): void { if (!saving.value) addingIds.value = [] }
  function toggleAddingIcon(id: string): void {
    if (saving.value || addingMemberIds.value.has(id) || !library.pool.some(icon => icon.id === id && icon.source !== 'placeholder' && (addingCategoryId.value !== 'category-special-boss' || icon.source === 'echo-catalog'))) return
    addingIds.value = produce(addingIds.value, next => {
      const index = next.indexOf(id)
      if (index < 0) next.push(id)
      else next.splice(index, 1)
    })
  }
  async function confirmAddIcons(): Promise<void> {
    const id = addingCategoryId.value
    const ids = addingIds.value.filter(iconId => !addingMemberIds.value.has(iconId))
    if (!id || !ids.length) return
    if (await persistOperation(next => {
      const category = next.categories.find(category => category.id === id)
      if (!category) throw new Error('分类已不存在')
      for (const iconId of ids) if (!next.categories.some(item => item.icons.some(member => member.iconId === iconId))) category.icons.push({ iconId })
    })) closeAddIcons()
  }
  const memberSearch = shallowRef('')
  function setMemberSearch(value: string): void { memberSearch.value = value }
  const activeCategory = computed(() => library.draft.categories.find(category => category.id === filters.value.category) ?? null)
  const unclassifiedCount = computed(() => library.draft.categories.find(category => category.id === 'unclassified')?.icons.length ?? 0)
  const openedCategoryId = shallowRef<string | null>(null)
  const selectedCategory = computed(() => {
    const category = library.draft.categories.find(category => category.id === (openedCategoryId.value ?? activeCategory.value?.id))
    return category?.icons.some(member => member.iconId === selected.value?.id) ? category : null
  })
  function openCategoryIcon(id: string, categoryId: string): void {
    openedCategoryId.value = categoryId
    select(id)
  }
  const detailsOpen = shallowRef(false)
  const detailsClosing = shallowRef(false)
  const detailsVisible = computed(() => !!selected.value && !detailsClosing.value)
  const referencesOpen = shallowRef(false)
  const aliasCategory = shallowRef<string | null>(null)
  const pendingIconNames = shallowRef<Record<string, string>>({})
  function closeDetails(): void {
    detailsOpen.value = false
    detailsClosing.value = true
  }
  function finishCloseDetails(): void {
    if (!detailsClosing.value) return
    pendingIconNames.value = {}
    pendingIconCategories.value = {}
    openedCategoryId.value = null
    detailsOpen.value = false
    filters.value = produce(filters.value, next => { next.selectedId = null })
    detailsClosing.value = false
  }
  function toggleReferences(): void { referencesOpen.value = !referencesOpen.value }
  function toggleAlias(id: string): void { aliasCategory.value = aliasCategory.value === id ? null : id }
  const search = shallowRef('')
  const busy = shallowRef(false)
  const loaded = shallowRef(false)
  const error = shallowRef('')
  const messageStore = useMessageStore()
  function reportError(message: string): void { error.value = message; messageStore.showError(message) }
  const notice = shallowRef('')
  const revision = shallowRef<string | null>(null)
  const usage = shallowRef<Usage>([])
  const usageError = shallowRef('')
  const usageLoaded = shallowRef(false)
  let pending: Promise<void> | null = null
  const usageByIcon = computed(() => {
    const groups = new Map<string, Usage>()
    for (const point of usage.value) {
      if (!point.iconId) continue
      const rows = groups.get(point.iconId) ?? []
      rows.push(point)
      groups.set(point.iconId, rows)
    }
    return groups
  })
  function matchesIcon(icon: (typeof library.pool)[number], state: Filters): boolean {
    const category = library.draft.categories.find(category => category.id === state.category)
    const builtInCategory = builtInNavigationIconCategories.find(category => category.id === state.category)
    if (builtInCategory && !builtInCategory.icons.includes(icon.id)) return false
    if (state.source !== 'all' && icon.source !== state.source) return false
    if (state.category === 'unclassified' && !category) return false
    if (category && !category.icons.some(member => member.iconId === icon.id)) return false
    const status = state.status
    if (status === 'unnamed' && icon.name.trim()) return false
    return `${iconDisplayName(icon)} ${icon.id}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())
  }
  const filtered = computed(() => library.pool.filter(icon => matchesIcon(icon, filters.value)).toSorted(compareIconPosition))
  const selected = computed(() => filtered.value.find(icon => icon.id === filters.value.selectedId) ?? null)
  const selectedIconName = computed(() => selected.value ? pendingIconNames.value[selected.value.id] ?? selected.value.name : '')
  const references = computed(() => selected.value ? usageByIcon.value.get(selected.value.id) ?? [] : [])
  const duplicateName = computed(() => selectedIconName.value.trim() && library.pool.some(icon => icon.id !== selected.value?.id && icon.name.trim() === selectedIconName.value.trim()))
  const unnamedCount = computed(() => library.pool.filter(icon => !icon.name.trim()).length)

  function reconcileSelection(): void {
    const id = queryBinding.value?.read().icon
    if (typeof id !== 'string' || filtered.value.some(icon => icon.id === id)) return
    filters.value = produce(filters.value, next => { next.selectedId = null })
    referencesOpen.value = false
    aliasCategory.value = null
    detailsOpen.value = false
  }

  function parseQuery(query: Record<string, unknown>): Filters {
    const status = iconFilterSchema.safeParse(query.status)
    const selectedId = typeof query.icon === 'string' && library.pool.some(icon => icon.id === query.icon) ? query.icon : null
    const category = typeof query.category === 'string' && (builtInNavigationIconCategories.some(category => category.id === query.category) || query.category === 'unclassified' || library.draft.categories.some(category => category.id === query.category)) ? query.category : 'all'
    const source = iconSources.find(source => source.id === query.source)?.id ?? 'all'
    const view = query.view === 'icons' ? 'icons' : 'categories'
    const state: Filters = { view, source, status: status.success ? status.data : 'all', selectedId, category }
    if (state.selectedId && !library.pool.some(icon => icon.id === state.selectedId && matchesIcon(icon, state))) state.selectedId = null
    return state
  }
  function setView(view: 'categories' | 'icons'): void {
    if (filters.value.view === view) return
    pendingCategoryNames.value = {}
    openedCategoryId.value = null
    filters.value = produce(filters.value, next => {
      next.view = view
      next.category = 'all'
      next.source = 'all'
      next.status = 'all'
      next.selectedId = null
    })
    search.value = ''
    detailsOpen.value = false
    referencesOpen.value = false
    aliasCategory.value = null
    categoryInput.value = ''
    memberSearch.value = ''
  }
  async function addCategoryMember(iconId: string): Promise<void> {
    const id = activeCategory.value?.id
    if (!id || !library.pool.some(icon => icon.id === iconId && icon.source !== 'placeholder')) return
    await persistOperation(next => {
      const category = next.categories.find(category => category.id === id)
      if (category && !category.icons.some(member => member.iconId === iconId)) category.icons.push({ iconId })
    })
  }
  async function removeCategoryMember(iconId: string, categoryId = activeCategory.value?.id): Promise<void> {
    const id = categoryId
    if (!id) return
    if (await persistOperation(next => {
      const category = next.categories.find(category => category.id === id)
      if (category) category.icons = category.icons.filter(member => member.iconId !== iconId)
    })) reconcileSelection()
  }
  function setCategory(id: string): void {
    openedCategoryId.value = null
    if (id !== 'all' && !builtInNavigationIconCategories.some(category => category.id === id) && id !== 'unclassified' && !library.draft.categories.some(category => category.id === id)) return
    if (id !== filters.value.category) pendingCategoryNames.value = {}
    filters.value = produce(filters.value, next => { next.category = id })
    reconcileSelection()
    categoryInput.value = ''
  }
  function setCategoryInput(value: string): void { categoryInput.value = value.slice(0, 100) }
  function reconcileCategories(): void {
    if (filters.value.category !== 'all' && !builtInNavigationIconCategories.some(category => category.id === filters.value.category) && filters.value.category !== 'unclassified' && !activeCategory.value) setCategory('all')
  }
  function createCategory(): void {
    if (busy.value) return
    try { setCategory(library.createCategory(categoryInput.value)); error.value = '' }
    catch (failure) { reportError(failure instanceof Error ? failure.message : '创建分类失败') }
  }
  const pendingCategoryNames = shallowRef<Record<string, string>>({})
  const activeCategoryName = computed(() => activeCategory.value ? pendingCategoryNames.value[activeCategory.value.id] ?? activeCategory.value.name : '')
  function renameActiveCategory(name: string): void {
    const category = activeCategory.value
    if (busy.value || saving.value || !category || category.id === 'unclassified') return
    pendingCategoryNames.value = produce(pendingCategoryNames.value, next => { next[category.id] = name.slice(0, 100) })
  }
  function renameCategory(): void {
    if (busy.value || !activeCategory.value) return
    renameActiveCategory(categoryInput.value)
    categoryInput.value = ''
  }
  function deleteCategory(): void {
    if (busy.value || !activeCategory.value) return
    library.deleteCategory(activeCategory.value.id)
    closeDetails()
    setCategory('all')
  }
  function setMembership(categoryId: string, enabled: boolean): void {
    if (busy.value || !selected.value || selected.value.source === 'placeholder') return
    if (enabled) library.addToCategory(categoryId, [selected.value.id])
    else library.removeFromCategory(categoryId, [selected.value.id])
  }
  function setSource(value: string | number | null): void {
    const source = iconSources.find(source => source.id === value)?.id ?? 'all'
    filters.value = produce(filters.value, next => { next.source = source })
    reconcileSelection()
  }
  function setStatus(value: string | number | null): void {
    const parsed = iconFilterSchema.safeParse(value)
    if (parsed.success) filters.value = produce(filters.value, draft => { draft.status = parsed.data })
    reconcileSelection()
  }
  function select(id: string): void {
    if (library.pool.some(icon => icon.id === id)) {
      if (!detailsOpen.value || !selected.value) {
        pendingIconNames.value = {}
        pendingIconCategories.value = {}
      }
      filters.value = produce(filters.value, draft => { draft.selectedId = id })
      detailsClosing.value = false
      detailsOpen.value = true
      referencesOpen.value = false
      aliasCategory.value = null
    }
  }
  function setSearch(value: string): void { search.value = value; reconcileSelection() }
  function rename(value: string): void {
    if (busy.value || saving.value || !selected.value || selected.value.source === 'placeholder' || selected.value.source === 'echo-catalog') return
    const id = selected.value.id
    pendingIconNames.value = produce(pendingIconNames.value, next => { next[id] = value.slice(0, 200) })
  }
  function nextUnnamed(direction: -1 | 1): void {
    const icons = filtered.value
    const index = icons.findIndex(icon => icon.id === selected.value?.id)
    for (let step = 1; step <= icons.length; step++) {
      const icon = icons[(index + direction * step + icons.length * 2) % icons.length]
      if (icon && !icon.name.trim()) { select(icon.id); break }
    }
  }
  async function loadUsage(): Promise<void> {
    usageLoaded.value = false
    usageError.value = ''
    try {
      let response = await fetch('/api/editor/library', { cache: 'no-store' })
      let data: unknown
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        data = z.object({ library: usageSchema }).parse(await response.json()).library
      } else {
        response = await fetch('/data/custom-navigation-points.json', { cache: 'no-store' })
        if (!response.ok) throw new Error('定位点引用读取失败')
        data = await response.json()
      }
      usage.value = freeze(usageSchema.parse(data).points, true)
      usageLoaded.value = true
    } catch (failure) { usageError.value = failure instanceof Error ? failure.message : '定位点引用读取失败'; messageStore.showError(usageError.value) }
  }
  function load(): Promise<void> {
    if (pending) return pending
    if (loaded.value) return Promise.resolve()
    busy.value = true
    error.value = ''
    pending = (async () => {
      try {
        const snapshot = await readNavigationIconLibrary()
        if (snapshot) { if (!library.dirty) library.accept(snapshot.library); revision.value = snapshot.revision }
        await loadUsage()
        loaded.value = true
      } catch (failure) { reportError(failure instanceof Error ? failure.message : '图标配置读取失败') }
      finally { busy.value = false; pending = null }
    })()
    return pending
  }
  const editable = computed(() => import.meta.env.DEV && !!revision.value && loaded.value)
  const saving = shallowRef(false)
  let savePending: Promise<void> | null = null
  function edit(action: () => void): void {
    if (!editable.value || busy.value || saving.value) return
    action()
  }
  function reorderCategory(id: string, targetId: string, after: boolean): Promise<void> {
    if (id === 'unclassified' || targetId === 'unclassified') return Promise.resolve()
    if (!editable.value || busy.value || saving.value || !revision.value) return Promise.resolve()
    let order: number | null
    try { order = categoryMoveOrder(library.draft.categories, id, targetId, after) }
    catch (failure) { reportError(failure instanceof Error ? failure.message : '无法调整顺序'); return Promise.resolve() }
    if (order === null) return Promise.resolve()
    if (!library.saved.categories.some(category => category.id === id) || !library.saved.categories.some(category => category.id === targetId)) {
      reportError('请先保存新增分类，再拖动排序')
      return Promise.resolve()
    }
    const submitted = produce(library.saved, next => {
      const category = next.categories.find(category => category.id === id)
      if (category) category.order = order
    })
    saving.value = true
    savePending = (async () => {
      try {
        const result = await saveNavigationIconLibrary(submitted, revision.value ?? '')
        library.acknowledgeOrder(result.library, id, order)
        revision.value = result.revision
        notice.value = '分类顺序已保存'
      } catch (failure) { reportError(failure instanceof Error ? failure.message : '排序保存失败，请重新拖动') }
      finally { saving.value = false; savePending = null }
    })()
    return savePending
  }
  const removalOpen = shallowRef(false)
  const removalItems = shallowRef<{ iconId: string; name: string; categoryName: string; pointIds: string[]; options: { id: string; name: string }[] }[]>([])
  const removalChoices = shallowRef<Record<string, string>>({})
  let resolveRemoval: ((value: IconRemovalResolution[] | null) => void) | null = null
  function setRemovalChoice(iconId: string, replacementId: string | number | null): void {
    if (typeof replacementId !== 'string' || !removalItems.value.some(item => item.iconId === iconId && (replacementId === 'icon-not-found' || item.options.some(option => option.id === replacementId)))) return
    removalChoices.value = produce(removalChoices.value, next => { next[iconId] = replacementId })
  }
  const canConfirmRemoval = computed(() => removalItems.value.every(item => !!removalChoices.value[item.iconId]))
  function cancelRemoval(): void {
    removalOpen.value = false
    resolveRemoval?.(null)
    resolveRemoval = null
  }
  function confirmRemoval(): void {
    if (!canConfirmRemoval.value) return
    removalOpen.value = false
    resolveRemoval?.(removalItems.value.map(item => ({ iconId: item.iconId, pointIds: [...item.pointIds], replacementId: removalChoices.value[item.iconId] ?? '' })))
    resolveRemoval = null
  }
  async function persistOperation(update: (next: Draft<NavigationIconLibrary>) => void): Promise<boolean> {
    if (!editable.value || busy.value || saving.value || removalOpen.value || !revision.value) return false
    saving.value = true
    try {
      const submitted = produce(library.saved, update)
      const assigned = new Set(submitted.categories.flatMap(category => category.icons.map(icon => icon.iconId)))
      const removed = library.saved.categories.flatMap(category => category.icons.filter(icon => !assigned.has(icon.iconId) && !builtInIconType(icon.iconId)?.builtIn).map(icon => ({ iconId: icon.iconId, category })))
      let resolutions: IconRemovalResolution[] | undefined
      if (removed.length) {
        await loadUsage()
        if (!usageLoaded.value) throw new Error('无法核对定位点引用，未移除图标，请重试')
        removalItems.value = removed.flatMap(({ iconId, category }) => {
          const pointIds = (usageByIcon.value.get(iconId) ?? []).map(point => point.id)
          return pointIds.length ? [{ iconId, name: iconDisplayName(library.savedPool.find(icon => icon.id === iconId) ?? { id: iconId, name: '' }), categoryName: category.name, pointIds,
            options: category.icons.filter(icon => icon.iconId !== iconId && assigned.has(icon.iconId)).map(icon => ({ id: icon.iconId, name: iconDisplayName(library.savedPool.find(item => item.id === icon.iconId) ?? { id: icon.iconId, name: '' }) })),
          }] : []
        })
        if (removalItems.value.length) {
          removalChoices.value = {}
          removalOpen.value = true
          const decision = await new Promise<IconRemovalResolution[] | null>(resolve => { resolveRemoval = resolve })
          if (!decision) return false
          resolutions = decision
        }
      }
      const result = resolutions ? await saveNavigationIconLibrary(submitted, revision.value, resolutions) : await saveNavigationIconLibrary(submitted, revision.value)
      library.acknowledgeOperation(result.library, update)
      revision.value = result.revision
      if (resolutions) await loadUsage()
      return true
    } catch (failure) {
      reportError(failure instanceof Error ? failure.message : '保存失败，请重试')
      return false
    } finally { saving.value = false }
  }
  const categoryNameDirty = computed(() => !!activeCategory.value && activeCategoryName.value !== library.saved.categories.find(category => category.id === activeCategory.value?.id)?.name)
  async function saveCategoryName(): Promise<void> {
    const category = activeCategory.value
    if (!category || category.id === 'unclassified') return
    const id = category.id
    const name = activeCategoryName.value.trim()
    if (!name || library.saved.categories.some(item => item.id !== id && item.name === name)) { reportError('分类名称不能为空或重复'); return }
    if (await persistOperation(next => { const target = next.categories.find(category => category.id === id); if (target) target.name = name })) {
      pendingCategoryNames.value = produce(pendingCategoryNames.value, next => { delete next[id] })
    }
  }
  const pendingDeleteCategoryId = shallowRef<string | null>(null)
  const pendingDeleteCategory = computed(() => library.saved.categories.find(category => category.id === pendingDeleteCategoryId.value) ?? null)
  function requestCategoryDeletion(): void {
    if (!editable.value || busy.value || saving.value || !activeCategory.value || activeCategory.value.id === 'unclassified') return
    pendingDeleteCategoryId.value = activeCategory.value.id
  }
  function cancelCategoryDeletion(): void { if (!saving.value) pendingDeleteCategoryId.value = null }
  async function deleteActiveCategory(): Promise<void> {
    const id = pendingDeleteCategoryId.value
    if (!id || id === 'unclassified') return
    if (await persistOperation(next => { next.categories = next.categories.filter(category => category.id !== id) })) {
      pendingDeleteCategoryId.value = null
      closeDetails()
      setCategory('all')
    }
  }
  const pendingIconCategories = shallowRef<Record<string, string | null>>({})
  const selectedSavedIconCategoryId = computed(() => library.saved.categories.find(category => category.icons.some(member => member.iconId === selected.value?.id))?.id ?? null)
  const selectedIconCategoryId = computed(() => {
    const id = selected.value?.id
    if (!id) return null
    if (Object.hasOwn(pendingIconCategories.value, id)) return pendingIconCategories.value[id] ?? null
    return library.saved.categories.find(category => category.icons.some(member => member.iconId === id))?.id ?? null
  })
  function setSelectedIconCategory(value: string | number | null): void {
    const id = selected.value?.id
    if (!editable.value || busy.value || saving.value || !id || selected.value?.source === 'placeholder') return
    if ((builtInIconType(id)?.icons.length ?? 0) > 1) return
    if (value === 'category-special-boss' && selected.value?.source !== 'echo-catalog') return
    if (value !== null && !library.saved.categories.some(category => category.id === value)) return
    pendingIconCategories.value = produce(pendingIconCategories.value, next => { next[id] = typeof value === 'string' ? value : null })
  }
  const selectedIconDirty = computed(() => {
    const id = selected.value?.id
    if (!id) return false
    const value = (data: NavigationIconLibrary) => data.icons.find(icon => icon.id === id) ?? data.overrides.find(icon => icon.id === id)
    const savedCategory = library.saved.categories.find(category => category.icons.some(member => member.iconId === id))?.id ?? null
    return selectedIconName.value !== selected.value?.name || selectedIconCategoryId.value !== savedCategory || JSON.stringify(value(library.draft)) !== JSON.stringify(value(library.saved))
  })
  async function saveSelectedIcon(): Promise<void> {
    if (selected.value?.source === 'placeholder') return
    const id = selected.value?.id
    if (!id) return
    const icon = library.draft.icons.find(icon => icon.id === id)
    const name = selectedIconName.value
    const nameEditable = selected.value?.source !== 'echo-catalog'
    const categoryId = selectedIconCategoryId.value
    const saved = await persistOperation(next => {
      if (categoryId !== null && !next.categories.some(category => category.id === categoryId)) throw new Error('分类已不存在')
      for (const category of next.categories) {
        if (category.id === categoryId) {
          if (!category.icons.some(member => member.iconId === id)) category.icons.push({ iconId: id })
        } else category.icons = category.icons.filter(member => member.iconId !== id)
      }
      if (icon) {
        const target = next.icons.find(icon => icon.id === id)
        if (target) target.name = name
      } else if (nameEditable) {
        const index = next.overrides.findIndex(icon => icon.id === id)
        if (index < 0) next.overrides.push({ id, name })
        else next.overrides[index] = { id, name }
      }
    })
    if (saved) {
      pendingIconNames.value = produce(pendingIconNames.value, next => { delete next[id] })
      pendingIconCategories.value = produce(pendingIconCategories.value, next => { delete next[id] })
      reconcileSelection()
      messageStore.showSuccess('图标已保存')
    }
  }
  function flushEdits(): Promise<void> {
    if (savePending) return savePending
    if (!editable.value || !library.dirty || !revision.value) return Promise.resolve()
    saving.value = true
    error.value = ''
    savePending = (async () => {
      try {
        if (library.dirty && revision.value) {
          const submitted = library.draft
          const result = await saveNavigationIconLibrary(submitted, revision.value)
          library.acknowledge(result.library, submitted)
          revision.value = result.revision
        }
        notice.value = '已保存到仓库'
      } catch (failure) {
        reportError(failure instanceof Error ? failure.message : '保存失败，修改仍保留在页面')
      } finally {
        saving.value = false
        savePending = null
      }
    })()
    return savePending
  }
  async function save(): Promise<void> {
    if (busy.value || !revision.value) return
    busy.value = true; error.value = ''; notice.value = ''
    try {
      const result = await saveNavigationIconLibrary(library.draft, revision.value)
      library.accept(result.library)
      revision.value = result.revision
      notice.value = '图标配置已保存到项目'
    } catch (failure) { reportError(failure instanceof Error ? failure.message : '保存失败，编辑内容已保留') }
    finally { busy.value = false }
  }
  async function importFile(file: File): Promise<void> {
    if (busy.value) return
    busy.value = true; error.value = ''
    try {
      if (file.size > 1024 * 1024) throw new Error('配置文件超过 1 MB')
      library.importDraft(JSON.parse(await file.text()))
      reconcileCategories()
      notice.value = '配置已导入草稿；请保存或导出'
    } catch (failure) { reportError(failure instanceof Error ? failure.message : '导入失败') }
    finally { busy.value = false }
  }
  function discarded(): void { if (!busy.value) { library.discard(); reconcileCategories(); notice.value = '已还原到最近保存的配置'; error.value = '' } }
  function exported(): void { notice.value = '配置已导出；下载文件不等于保存到项目' }
  return {
    removalOpen: shallowReadonly(removalOpen), removalItems: shallowReadonly(removalItems), removalChoices: shallowReadonly(removalChoices), canConfirmRemoval, setRemovalChoice, cancelRemoval, confirmRemoval,
    addingCategory, addingIcons, addingMemberIds, addingIds: shallowReadonly(addingIds), addingSource: shallowReadonly(addingSource),
    addingEchoCost: shallowReadonly(addingEchoCost), addingEchoCostVisible, setAddingEchoCost,
    addingOpen: shallowReadonly(addingOpen), finishCloseAddIcons, detailsVisible, finishCloseDetails,
    openAddIcons, closeAddIcons, setAddingSource, clearAddingSelection, toggleAddingIcon, confirmAddIcons,
    pendingDeleteCategory, requestCategoryDeletion, cancelCategoryDeletion,
    selectedIconName, selectedSavedIconCategoryId, selectedIconCategoryId, setSelectedIconCategory, categoryNameDirty, selectedIconDirty, saveCategoryName, deleteActiveCategory, saveSelectedIcon,
    detailsOpen: shallowReadonly(detailsOpen), referencesOpen: shallowReadonly(referencesOpen), aliasCategory: shallowReadonly(aliasCategory), closeDetails, toggleReferences, toggleAlias,
    memberSearch: shallowReadonly(memberSearch), setMemberSearch, renameActiveCategory, setView, addCategoryMember, removeCategoryMember, setSource, editable, saving: shallowReadonly(saving), edit, flushEdits,
    createCategoryOpen: shallowReadonly(createCategoryOpen), openCreateCategory, closeCreateCategory, saveNewCategory,
    categoryInput: shallowReadonly(categoryInput), activeCategoryName, activeCategory, unclassifiedCount,
    reorderCategory, setCategory, setCategoryInput, createCategory, renameCategory, deleteCategory, setMembership,
    filters: shallowReadonly(filters), search: shallowReadonly(search), busy: shallowReadonly(busy), loaded: shallowReadonly(loaded),
    error: shallowReadonly(error), notice: shallowReadonly(notice), revision: shallowReadonly(revision), usageError: shallowReadonly(usageError), usageLoaded: shallowReadonly(usageLoaded),
    filtered, selected, selectedCategory, openCategoryIcon, references, duplicateName, unnamedCount, usageByIcon,
    bindQuery, unbindQuery, setStatus, select, setSearch, rename, nextUnnamed, load, loadUsage, save, importFile, discarded, exported,
  }
})
