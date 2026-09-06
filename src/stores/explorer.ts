import { computed, onScopeDispose, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { freeze, produce } from 'immer'
import { DEFAULT_ROUTE_Z_WEIGHT, DEFAULT_STATE_ID } from '../url/explorer-url.ts'
import type { ExplorerUrlState, MapViewportState, MobileSheet } from '../url/explorer-url.ts'
import { planRouteInWorker } from '../route/worker-client.ts'
import type { EchoMapLocation, MapDataset, MapFloorDefinition, MapStateDefinition, PointLibrary, PointSource, RouteResult } from '../domain/types.ts'
import { echoMembers, emptyPointLibrary, libraryLocations } from '../domain/point-library.ts'
import { combinePointLibraries } from '../domain/point-matching.ts'
import {
  hasGameCoordinate,
  isRouteStart,
  matchesMapScope,
  selectActiveEchoIds,
  selectEchoDefinitions,
  selectEchoLocations,
  selectRegionLabels,
  selectRegions,
} from '../domain/explorer-selectors.ts'
import { resolveExplorerState } from '../url/resolve-explorer-state.ts'
import { createRoutePlanInput } from '../route/plan-input.ts'
import type { GravityType, PointLocationBase } from '../domain/types.ts'
import { hasGravityMap } from '../domain/gravity.ts'

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
  const pointLibrary = shallowRef<PointLibrary>(immutableSnapshot(emptyPointLibrary()))
  const officialLibrary = shallowRef<PointLibrary>(immutableSnapshot(emptyPointLibrary()))
  const pointSource = shallowRef<PointSource>('all')
  const selectedPointId = shallowRef<string | null>(null)
  const candidateIds = shallowRef<string[]>(immutableSnapshot([]))
  const selectedStateId = shallowRef<number>(DEFAULT_STATE_ID)
  const selectedCountryId = shallowRef<number | null>(null)
  const selectedLevelId = shallowRef<string | null>(null)
  const selectedGravity = shallowRef<GravityType>(1)
  const baseTileError = shallowRef(false)
  const baseTileRetry = shallowRef(0)
  const selectedEchoIds = shallowRef<string[]>(immutableSnapshot([]))
  const selectedSonataIds = shallowRef<string[]>(immutableSnapshot([]))
  const echoSearch = shallowRef('')
  const hiddenPointGroupIds = shallowRef<string[]>(immutableSnapshot([]))
  const showProvisional = shallowRef(true)
  const controlPanelCollapsed = shallowRef(false)
  const mobileSheet = shallowRef<MobileSheet>(null)
  const routeZWeight = shallowRef(DEFAULT_ROUTE_Z_WEIGHT)
  const mapViewport = shallowRef<MapViewportState | null>(null)
  const mapNavigationRequest = shallowRef<{ regionId: string } | null>(null)
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
  const supportsGravity = computed(() => hasGravityMap(activeState.value))
  const regions = computed(() => selectRegions(dataset.value?.regionLabels ?? [], selectedStateId.value))
  const activeMapName = computed(() => {
    const state = activeState.value
    if (!state) return ''
    const labels = new Map(dataset.value?.regionLabels.map((label) => [label.id, label]))
    const matchingGroups = dataset.value?.mapNavigation.flatMap((country) => country.groups.filter((group) => (
      group.regionIds.length > 0 && group.regionIds.every((id) => labels.get(id)?.stateId === state.id)
    ))) ?? []
    return matchingGroups.length === 1 ? matchingGroups[0]?.name ?? state.name
      : state.id === DEFAULT_STATE_ID ? '地表地图' : state.name
  })
  const echoesMatchingSonata = computed(() => selectEchoDefinitions(
    dataset.value?.echoes ?? [], selectedSonataIds.value, echoSearch.value,
  ))
  const activeEchoIds = computed<ReadonlySet<string>>(() => selectActiveEchoIds(
    dataset.value?.echoes ?? [], selectedEchoIds.value, selectedSonataIds.value,
  ))
  const authoredLocations = computed(() => dataset.value
    ? immutableSnapshot(libraryLocations(combinePointLibraries({ ...pointLibrary.value, points: pointLibrary.value.points.filter(({ status }) => status === 'verified') }, officialLibrary.value, pointSource.value), dataset.value))
    : { echoLocations: [], navigationPoints: [], navigationPointGroups: [] })
  const allEchoLocations = computed<readonly EchoMapLocation[]>(() => authoredLocations.value.echoLocations)
  const allNavigationPoints = computed(() => authoredLocations.value.navigationPoints)
  const allNavigationPointGroups = computed(() => authoredLocations.value.navigationPointGroups)
  const mapScope = computed(() => ({
    gravityType: supportsGravity.value ? selectedGravity.value : null,
    stateId: selectedStateId.value,
    countryId: selectedCountryId.value,
    levelId: selectedLevelId.value,
  }))
  const visibleEchoLocations = computed(() => selectEchoLocations(
    allEchoLocations.value, mapScope.value, activeEchoIds.value, showProvisional.value,
  ))
  const selectedEchoLocation = computed(() => visibleEchoLocations.value.find(({ id }) => id === selectedPointId.value) ?? null)
  const selectedNavigationPoint = computed(() => visibleNavigationPoints.value.find(({ id }) => id === selectedPointId.value) ?? null)
  const pointCandidates = computed(() => visibleEchoLocations.value.filter(({ id }) => candidateIds.value.includes(id)))
  const matchingMonsterCount = computed(() => visibleEchoLocations.value.reduce((sum, location) => sum + echoMembers(location).reduce((count, member) => count + (activeEchoIds.value.has(member.echoId) ? member.count ?? 0 : 0), 0), 0))
  const scopedNavigationPoints = computed(() => (
    allNavigationPoints.value.filter((location) => matchesMapScope(location, mapScope.value))
  ))
  const visibleNavigationPoints = computed(() => (
    scopedNavigationPoints.value.filter(({ groupId }) => !hiddenPointGroupIds.value.includes(groupId))
  ))
  const visibleRegionLabels = computed(() => selectRegionLabels(dataset.value?.regionLabels ?? [], mapScope.value))
  function hasRouteGravity(point: PointLocationBase): boolean {
    return !supportsGravity.value || point.gravityType === selectedGravity.value
  }
  const routeEligibleLocations = computed(() => visibleEchoLocations.value.filter((point) => hasGameCoordinate(point) && hasRouteGravity(point)))
  const routeEligibleNavigationPoints = computed(() => scopedNavigationPoints.value.filter((point) => isRouteStart(point) && hasRouteGravity(point)))
  const unmarkedGravityCount = computed(() => supportsGravity.value
    ? [...visibleEchoLocations.value, ...scopedNavigationPoints.value].filter(({ gravityType }) => gravityType === null).length : 0)

  function setDataset(value: MapDataset): void {
    clearRoute()
    mapNavigationRequest.value = null
    dataset.value = immutableSnapshot(value)
    selectedGravity.value = 1
    baseTileError.value = false
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

    pointSource.value = state.pointSource ?? 'all'
    const resolved = resolveExplorerState({ ...currentDataset, navigationPoints: allNavigationPoints.value, navigationPointGroups: allNavigationPointGroups.value }, state, selectedStateId.value)
    selectedStateId.value = resolved.stateId
    selectedCountryId.value = resolved.countryId
    selectedLevelId.value = resolved.levelId
    selectedGravity.value = resolved.gravityType ?? 1
    baseTileError.value = false
    selectedEchoIds.value = immutableSnapshot([...resolved.echoIds])
    selectedSonataIds.value = immutableSnapshot([...resolved.sonataIds])
    hiddenPointGroupIds.value = immutableSnapshot([...resolved.hiddenPointGroupIds])
    showProvisional.value = resolved.showProvisional
    controlPanelCollapsed.value = resolved.controlPanelCollapsed
    mobileSheet.value = resolved.mobileSheet
    routeZWeight.value = resolved.routeZWeight
    mapViewport.value = immutableSnapshot(resolved.viewport)
    echoSearch.value = ''
    clearRoute()
  }

  function selectState(id: number): void {
    selectedGravity.value = 1
    baseTileError.value = false
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

  function selectGravity(gravity: GravityType): void {
    if ((gravity !== 1 && gravity !== 2) || !supportsGravity.value || selectedGravity.value === gravity) return
    clearRoute()
    selectedGravity.value = gravity
    baseTileError.value = false
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

  function navigateToRegion(id: string): void {
    const currentDataset = dataset.value
    const destination = currentDataset?.regionLabels.find((region) => region.id === id)
    if (!destination || !currentDataset?.mapNavigation.some((country) => country.regionIds.includes(id))) return
    if (selectedStateId.value !== destination.stateId) {
      selectedGravity.value = 1
      baseTileError.value = false
    }
    if (selectedStateId.value !== destination.stateId || selectedCountryId.value !== null || selectedLevelId.value !== null) clearRoute()
    else {
      selectedPointId.value = null
      candidateIds.value = immutableSnapshot([])
    }
    selectedStateId.value = destination.stateId
    // A destination moves the map; it does not restrict which countries' points are visible.
    selectedCountryId.value = null
    selectedLevelId.value = null
    mapViewport.value = null
    mapNavigationRequest.value = immutableSnapshot({ regionId: id })
    mobileSheet.value = null
  }

  function completeMapNavigation(): void {
    mapNavigationRequest.value = null
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
    selectedPointId.value = null
    candidateIds.value = immutableSnapshot([])
  }

  async function planRoute(): Promise<void> {
    if (planning.value || routeEligibleLocations.value.length === 0) {
      return
    }
    const controller = new AbortController()
    activePlan = controller
    planning.value = true
    routeError.value = ''
    try {
      const input = createRoutePlanInput(
        dataset.value, routeEligibleLocations.value, routeEligibleNavigationPoints.value,
        selectedStateId.value, routeZWeight.value, activeEchoIds.value,
      )
      const result = await planRouteInWorker(input, controller.signal)
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
    pointSource: shallowReadonly(pointSource),
    allEchoLocations, allNavigationPoints, allNavigationPointGroups, activeEchoIds, matchingMonsterCount, selectedEchoLocation, selectedNavigationPoint,
    setPointLibrary: (value: PointLibrary) => {
      pointLibrary.value = immutableSnapshot(value)
      clearRoute()
    },
    setOfficialPointLibrary: (value: PointLibrary) => {
      officialLibrary.value = immutableSnapshot(value)
      clearRoute()
    },
    setPointSource: (value: PointSource) => {
      pointSource.value = value
      hiddenPointGroupIds.value = immutableSnapshot([])
      clearRoute()
    },
    pointCandidates,
    selectPoint: (id: string | null) => {
      selectedPointId.value = id
      candidateIds.value = immutableSnapshot([])
    },
    selectPointCandidates: (ids: string[]) => {
      candidateIds.value = immutableSnapshot(ids)
      selectedPointId.value = null
    },
    dataset: shallowReadonly(dataset),
    selectedStateId: shallowReadonly(selectedStateId),
    selectedCountryId: shallowReadonly(selectedCountryId),
    selectedLevelId: shallowReadonly(selectedLevelId),
    selectedGravity: shallowReadonly(selectedGravity),
    supportsGravity, unmarkedGravityCount, selectGravity,
    baseTileError: shallowReadonly(baseTileError),
    baseTileRetry: shallowReadonly(baseTileRetry),
    reportBaseTileError: (failed: boolean) => { baseTileError.value = failed },
    retryBaseTiles: () => { baseTileError.value = false; baseTileRetry.value += 1 },
    selectedEchoIds: shallowReadonly(selectedEchoIds),
    selectedSonataIds: shallowReadonly(selectedSonataIds),
    echoSearch: shallowReadonly(echoSearch),
    hiddenPointGroupIds: shallowReadonly(hiddenPointGroupIds),
    showProvisional: shallowReadonly(showProvisional),
    controlPanelCollapsed: shallowReadonly(controlPanelCollapsed),
    mobileSheet: shallowReadonly(mobileSheet),
    routeZWeight: shallowReadonly(routeZWeight),
    mapViewport: shallowReadonly(mapViewport),
    mapNavigationRequest: shallowReadonly(mapNavigationRequest),
    activeMapName,
    navigateToRegion,
    completeMapNavigation,
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
