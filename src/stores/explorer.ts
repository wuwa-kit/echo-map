import { computed, onScopeDispose, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { freeze, produce } from 'immer'
import { DEFAULT_ROUTE_Z_WEIGHT, DEFAULT_STATE_ID } from '../url/explorer-url.ts'
import type { ExplorerUrlState, MapViewportState, MobileSheet } from '../url/explorer-url.ts'
import { planRouteInWorker } from '../route/worker-client.ts'
import type {
  EchoDefinition,
  EchoLocation,
  MapDataset,
  MapFloorDefinition,
  MapStateDefinition,
  NavigationPoint,
  RegionLabel,
  PointLocationBase,
  RoutePoint,
  RouteResult,
} from '../domain/types.ts'

function toggleId(values: string[], id: string): string[] {
  return produce(values, (draft) => {
    const index = draft.indexOf(id)
    if (index === -1) {
      draft.push(id)
    } else {
      draft.splice(index, 1)
    }
  })
}

function immutableSnapshot<T>(value: T): T {
  return freeze(value, true)
}

export const useExplorerStore = defineStore('explorer', () => {
  const dataset = shallowRef<MapDataset | null>(null)
  const selectedStateId = shallowRef<number>(DEFAULT_STATE_ID)
  const selectedCountryId = shallowRef<number | null>(null)
  const selectedLevelId = shallowRef<string | null>(null)
  const selectedEchoIds = shallowRef<string[]>(immutableSnapshot([]))
  const selectedSonataIds = shallowRef<string[]>(immutableSnapshot([]))
  const echoSearch = shallowRef('')
  const hiddenPointGroupIds = shallowRef<string[]>(immutableSnapshot([]))
  const showProvisional = shallowRef(true)
  const controlPanelCollapsed = shallowRef(false)
  const mobileSheet = shallowRef<MobileSheet>(null)
  const routeZWeight = shallowRef(DEFAULT_ROUTE_Z_WEIGHT)
  const mapViewport = shallowRef<MapViewportState | null>(null)
  const route = shallowRef<RouteResult | null>(null)
  const planning = shallowRef(false)
  const routeError = shallowRef('')
  let activePlan: AbortController | null = null

  onScopeDispose(() => activePlan?.abort())

  const states = computed(() => dataset.value?.states ?? [])
  const activeState = computed<MapStateDefinition | null>(() => (
    states.value.find(({ id }) => id === selectedStateId.value) ?? states.value[0] ?? null
  ))
  const floors = computed<MapFloorDefinition[]>(() => (
    activeState.value?.layeredMaps.flatMap(({ floors: mapFloors }) => mapFloors) ?? []
  ))
  const regions = computed<RegionLabel[]>(() => {
    const seen = new Set<number>()
    return (dataset.value?.regionLabels ?? []).filter((label) => {
      if (label.level !== 1 || label.stateId !== selectedStateId.value || seen.has(label.countryId)) {
        return false
      }
      seen.add(label.countryId)
      return true
    })
  })
  const echoesMatchingSonata = computed<EchoDefinition[]>(() => {
    const selectedSet = new Set(selectedSonataIds.value)
    const search = echoSearch.value.trim().toLocaleLowerCase('zh-CN')
    return (dataset.value?.echoes ?? []).filter((echo) => {
      const matchesSonata = selectedSet.size === 0 || echo.sonataIds.some((id) => selectedSet.has(id))
      return matchesSonata && (search.length === 0 || echo.name.toLocaleLowerCase('zh-CN').includes(search))
    })
  })
  const activeEchoIds = computed<Set<string>>(() => {
    const explicit = new Set(selectedEchoIds.value)
    if (explicit.size > 0) {
      return explicit
    }

    const sonataIds = new Set(selectedSonataIds.value)
    if (sonataIds.size > 0) {
      return new Set((dataset.value?.echoes ?? [])
        .filter((echo) => echo.sonataIds.some((id) => sonataIds.has(id)))
        .map(({ id }) => id))
    }

    return new Set()
  })

  function matchesMapScope(location: {
    stateId: number
    countryId: number | null
    levelId: string | null
  }): boolean {
    return location.stateId === selectedStateId.value
      && (selectedCountryId.value === null || location.countryId === selectedCountryId.value)
      && location.levelId === selectedLevelId.value
  }

  const visibleEchoLocations = computed<EchoLocation[]>(() => (
    (dataset.value?.echoLocations ?? []).filter((location) => (
      matchesMapScope(location)
      && activeEchoIds.value.has(location.echoId)
      && (showProvisional.value || location.gameCoordinate !== null)
    ))
  ))
  const scopedNavigationPoints = computed<NavigationPoint[]>(() => (
    (dataset.value?.navigationPoints ?? []).filter(matchesMapScope)
  ))
  const visibleNavigationPoints = computed<NavigationPoint[]>(() => (
    scopedNavigationPoints.value.filter(({ groupId }) => !hiddenPointGroupIds.value.includes(groupId))
  ))
  const visibleRegionLabels = computed<RegionLabel[]>(() => (
    (dataset.value?.regionLabels ?? []).filter((label) => (
      label.stateId === selectedStateId.value
      && label.level >= 2
      && (selectedCountryId.value === null || label.countryId === selectedCountryId.value)
    ))
  ))
  const routeEligibleLocations = computed(() => visibleEchoLocations.value.filter(({ gameCoordinate }) => gameCoordinate !== null))
  const routeEligibleNavigationPoints = computed(() => scopedNavigationPoints.value.filter(({ mode, gameCoordinate }) => (
    mode === 'fast-travel' && gameCoordinate !== null
  )))

  function setDataset(value: MapDataset): void {
    clearRoute()
    dataset.value = immutableSnapshot(value)
    const preferredState = value.states.find(({ id }) => id === DEFAULT_STATE_ID) ?? value.states[0]
    if (preferredState) {
      selectedStateId.value = preferredState.id
    }
  }

  function restoreUrlState(state: ExplorerUrlState): void {
    const currentDataset = dataset.value
    if (!currentDataset) {
      return
    }

    const restoredState = state.stateId === undefined
      ? undefined
      : currentDataset.states.find(({ id }) => id === state.stateId)
    const nextState = restoredState
      ?? currentDataset.states.find(({ id }) => id === DEFAULT_STATE_ID)
      ?? currentDataset.states[0]
    if (nextState) {
      selectedStateId.value = nextState.id
    }

    const countryIds = new Set(currentDataset.regionLabels
      .filter(({ level, stateId }) => level === 1 && stateId === selectedStateId.value)
      .map(({ countryId }) => countryId))
    selectedCountryId.value = state.countryId !== undefined && countryIds.has(state.countryId)
      ? state.countryId
      : null

    const floorIds = new Set(nextState?.layeredMaps.flatMap(({ floors }) => floors.map(({ id }) => id)) ?? [])
    selectedLevelId.value = state.levelId !== undefined && floorIds.has(state.levelId) ? state.levelId : null

    const echoIds = new Set(currentDataset.echoes.map(({ id }) => id))
    selectedEchoIds.value = immutableSnapshot((state.echoIds ?? []).filter((id) => echoIds.has(id)))
    const sonataIds = new Set(currentDataset.sonatas.map(({ id }) => id))
    selectedSonataIds.value = immutableSnapshot((state.sonataIds ?? []).filter((id) => sonataIds.has(id)))

    const pointGroupIds = new Set(currentDataset.navigationPointGroups.map(({ id }) => id))
    const pointGroupIdByTypeId = new Map(currentDataset.navigationPoints.map(({ typeId, groupId }) => [typeId, groupId]))
    hiddenPointGroupIds.value = immutableSnapshot([...new Set((state.hiddenPointGroupIds ?? []).flatMap((id) => {
      if (pointGroupIds.has(id)) {
        return [id]
      }
      const legacyGroupId = pointGroupIdByTypeId.get(id)
      return legacyGroupId ? [legacyGroupId] : []
    }))])
    showProvisional.value = state.showProvisional ?? true
    controlPanelCollapsed.value = state.controlPanelCollapsed ?? false
    mobileSheet.value = state.mobileSheet === 'filters' || state.mobileSheet === 'route'
      ? state.mobileSheet
      : null
    routeZWeight.value = state.routeZWeight !== undefined
      && state.routeZWeight >= 0.1
      && state.routeZWeight <= 10
      ? state.routeZWeight
      : DEFAULT_ROUTE_Z_WEIGHT
    mapViewport.value = state.viewport
      ? immutableSnapshot({ center: [...state.viewport.center], zoom: state.viewport.zoom })
      : null
    echoSearch.value = ''
    clearRoute()
  }

  function selectState(id: number): void {
    selectedStateId.value = id
    selectedCountryId.value = null
    selectedLevelId.value = null
    mapViewport.value = null
    clearRoute()
  }

  function selectCountry(id: number | null): void {
    selectedCountryId.value = id
    clearRoute()
  }

  function selectLevel(id: string | null): void {
    selectedLevelId.value = id
    mapViewport.value = null
    clearRoute()
  }

  function toggleEcho(id: string): void {
    selectedEchoIds.value = toggleId(selectedEchoIds.value, id)
    clearRoute()
  }

  function toggleSonata(id: string): void {
    selectedSonataIds.value = toggleId(selectedSonataIds.value, id)
    clearRoute()
  }

  function clearSonataFilters(): void {
    selectedSonataIds.value = immutableSnapshot([])
    clearRoute()
  }

  function setEchoSearch(value: string): void {
    echoSearch.value = value
  }

  function setPointGroupVisible(groupId: string, visible: boolean): void {
    hiddenPointGroupIds.value = produce(hiddenPointGroupIds.value, (draft) => {
      const index = draft.indexOf(groupId)
      if (visible && index !== -1) {
        draft.splice(index, 1)
      } else if (!visible && index === -1) {
        draft.push(groupId)
      }
    })
  }

  function showAllPointGroups(): void {
    hiddenPointGroupIds.value = immutableSnapshot([])
  }

  function hidePointGroups(groupIds: readonly string[]): void {
    hiddenPointGroupIds.value = produce(hiddenPointGroupIds.value, (draft) => {
      const hiddenIds = new Set(draft)
      for (const groupId of groupIds) {
        if (!hiddenIds.has(groupId)) {
          draft.push(groupId)
          hiddenIds.add(groupId)
        }
      }
    })
  }

  function setProvisionalVisible(value: boolean): void {
    showProvisional.value = value
    clearRoute()
  }

  function toggleControlPanel(): void {
    controlPanelCollapsed.value = !controlPanelCollapsed.value
  }

  function setMobileSheet(value: MobileSheet): void {
    mobileSheet.value = value
  }

  function setRouteZWeight(value: number): void {
    if (!Number.isFinite(value) || value < 0.1 || value > 10) {
      return
    }
    routeZWeight.value = value
    clearRoute()
  }

  function setMapViewport(value: MapViewportState | null): void {
    mapViewport.value = value === null
      ? null
      : immutableSnapshot({ center: [...value.center], zoom: value.zoom })
  }

  function setRoute(value: RouteResult): void {
    route.value = immutableSnapshot(value)
  }

  function clearRoute(): void {
    activePlan?.abort()
    activePlan = null
    planning.value = false
    routeError.value = ''
    route.value = null
  }

  async function planRoute(): Promise<void> {
    if (planning.value || routeEligibleLocations.value.length === 0) {
      return
    }
    const controller = new AbortController()
    activePlan = controller
    planning.value = true
    routeError.value = ''
    const names = new Map(dataset.value?.echoes.map(({ id, name }) => [id, name]))
    function toRoutePoint(location: PointLocationBase, echoId: string | null): RoutePoint {
      if (!location.gameCoordinate) {
        throw new Error(`点位 ${location.id} 缺少 XYZ`)
      }
      return {
        id: location.id,
        name: echoId === null ? location.typeName : names.get(echoId) ?? location.typeName,
        echoId,
        stateId: location.stateId,
        levelId: location.levelId,
        coordinate: location.gameCoordinate,
        mapCoordinate: [location.coordinate.mapX, location.coordinate.mapY],
      }
    }
    try {
      const result = await planRouteInWorker({
        points: routeEligibleLocations.value.map((location) => toRoutePoint(location, location.echoId)),
        startPoints: routeEligibleNavigationPoints.value.map((location) => toRoutePoint(location, null)),
        connectors: (dataset.value?.connectors ?? []).filter(({ stateId }) => stateId === selectedStateId.value),
        zWeight: routeZWeight.value,
      }, controller.signal)
      if (activePlan === controller) {
        setRoute(result)
      }
    } catch (error) {
      if (activePlan === controller) {
        route.value = null
        routeError.value = error instanceof Error ? error.message : String(error)
      }
    } finally {
      if (activePlan === controller) {
        activePlan = null
        planning.value = false
      }
    }
  }

  function clearFilters(): void {
    selectedEchoIds.value = immutableSnapshot([])
    selectedSonataIds.value = immutableSnapshot([])
    echoSearch.value = ''
    clearRoute()
  }

  return {
    dataset: shallowReadonly(dataset),
    selectedStateId: shallowReadonly(selectedStateId),
    selectedCountryId: shallowReadonly(selectedCountryId),
    selectedLevelId: shallowReadonly(selectedLevelId),
    selectedEchoIds: shallowReadonly(selectedEchoIds),
    selectedSonataIds: shallowReadonly(selectedSonataIds),
    echoSearch: shallowReadonly(echoSearch),
    hiddenPointGroupIds: shallowReadonly(hiddenPointGroupIds),
    showProvisional: shallowReadonly(showProvisional),
    controlPanelCollapsed: shallowReadonly(controlPanelCollapsed),
    mobileSheet: shallowReadonly(mobileSheet),
    routeZWeight: shallowReadonly(routeZWeight),
    mapViewport: shallowReadonly(mapViewport),
    route: shallowReadonly(route),
    planning: shallowReadonly(planning),
    routeError: shallowReadonly(routeError),
    states,
    activeState,
    floors,
    regions,
    echoesMatchingSonata,
    visibleEchoLocations,
    visibleNavigationPoints,
    visibleRegionLabels,
    routeEligibleLocations,
    routeEligibleNavigationPoints,
    setDataset,
    restoreUrlState,
    selectState,
    selectCountry,
    selectLevel,
    toggleEcho,
    toggleSonata,
    clearSonataFilters,
    setEchoSearch,
    setPointGroupVisible,
    showAllPointGroups,
    hidePointGroups,
    setProvisionalVisible,
    toggleControlPanel,
    setMobileSheet,
    planRoute,
    setRouteZWeight,
    setMapViewport,
    setRoute,
    clearRoute,
    clearFilters,
  }
})
