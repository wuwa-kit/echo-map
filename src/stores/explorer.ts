import { computed, onScopeDispose, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { freeze, produce } from 'immer'
import type { Extent } from 'ol/extent.js'
import { DEFAULT_STATE_ID } from '../url/explorer-url.ts'
import type { EchoCostFilter, ExplorerUrlState, MapViewportState, MobileSheet } from '../url/explorer-url.ts'
import { planRouteInWorker } from '../route/worker-client.ts'
import type { EchoMapLocation, MapDataset, MapFloorDefinition, MapStateDefinition, PointLibrary, PointSource, PointSourceFilter, RoutePlanResult, RouteResult } from '../domain/types.ts'
import { echoMembers, emptyPointLibrary, libraryLocations } from '../domain/point-library.ts'
import { combinePointLibraries } from '../domain/point-matching.ts'
import {
  hasGameCoordinate,
  isRouteStart,
  matchesMapContext,
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
import { createFloorCoverage, floorGroupsInViewport } from '../map/floor-coverage.ts'
import { MAP_ZOOM_LEVELS, mapZoomForResolution } from '../map/point-visibility.ts'
import { useEqualComputed } from '../composables/useEqualComputed.ts'
import { createRouteGroupCandidates, mapStateName, routeGroupId } from '../route/route-groups.ts'

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
  const pointSourceFilters = shallowRef<PointSourceFilter[]>(immutableSnapshot([]))
  const selectedPointId = shallowRef<string | null>(null)
  const candidateIds = shallowRef<string[]>(immutableSnapshot([]))
  const selectedStateId = shallowRef<number>(DEFAULT_STATE_ID)
  const selectedCountryId = shallowRef<number | null>(null)
  const selectedLevelId = shallowRef<string | null>(null)
  const compactFloors = shallowRef(true)
  const floorViewport = shallowRef<{ extent: [number, number, number, number]; resolution: number } | null>(null)
  const floorRequest = shallowRef<{ token: number; levelId: string; status: 'loading' | 'error' } | null>(null)
  let floorRequestToken = 0
  const selectedGravity = shallowRef<GravityType>(1)
  const baseTileError = shallowRef(false)
  const baseTileRetry = shallowRef(0)
  const selectedEchoIds = shallowRef<string[]>(immutableSnapshot([]))
  const sonataFilterIds = shallowRef<string[]>(immutableSnapshot([]))
  const echoCostFilters = shallowRef<EchoCostFilter[]>(immutableSnapshot([]))
  const echoSearch = shallowRef('')
  const showProvisional = shallowRef(true)
  const controlPanelCollapsed = shallowRef(false)
  const mobileSheet = shallowRef<MobileSheet>(null)
  const mapViewport = shallowRef<MapViewportState | null>(null)
  const mapNavigationRequest = shallowRef<{ regionId: string } | null>(null)
  const route = shallowRef<RouteResult | null>(null)
  const routePlan = shallowRef<RoutePlanResult | null>(null)
  const planning = shallowRef(false)
  const routeError = shallowRef('')
  const planningCompleted = shallowRef(0)
  const planningTotal = shallowRef(0)
  let activePlan: AbortController | null = null

  onScopeDispose(() => activePlan?.abort())

  const pointSource = computed<PointSource>(() => (
    pointSourceFilters.value.length === 1 ? pointSourceFilters.value[0] ?? 'all' : 'all'
  ))

  const states = computed(() => dataset.value?.states ?? [])
  const activeState = computed<MapStateDefinition | null>(() => (
    states.value.find(({ id }) => id === selectedStateId.value) ?? states.value[0] ?? null
  ))
  const floors = computed<MapFloorDefinition[]>(() => (
    activeState.value?.layeredMaps.flatMap(({ floors: mapFloors }) => mapFloors) ?? []
  ))
  const floorCoverage = computed(() => createFloorCoverage(activeState.value, dataset.value?.source.tileWidth ?? 1024))
  const floorSwitcherVisible = computed(() => floorViewport.value !== null
    && mapZoomForResolution(floorViewport.value.resolution) >= MAP_ZOOM_LEVELS.local.minZoom)
  const nearbyFloorGroupIds = useEqualComputed(() => floorSwitcherVisible.value
    ? floorGroupsInViewport(floorCoverage.value, floorViewport.value?.extent ?? null) : [])
  const selectedFloor = computed(() => floors.value.find(({ id }) => id === selectedLevelId.value) ?? null)
  const selectedFloorGroup = computed(() => activeState.value?.layeredMaps.find(({ id }) => id === selectedFloor.value?.layeredMapId) ?? null)
  const requestedFloor = computed(() => floors.value.find(({ id }) => id === floorRequest.value?.levelId) ?? null)
  const nearbyFloorGroups = computed(() => activeState.value?.layeredMaps.filter(({ id }) => (
    id === selectedFloorGroup.value?.id || id === requestedFloor.value?.layeredMapId || nearbyFloorGroupIds.value.includes(id)
  )) ?? [])
  const displayedFloorGroup = computed(() => {
    const groupId = selectedFloorGroup.value?.id ?? requestedFloor.value?.layeredMapId ?? nearbyFloorGroupIds.value[0]
    return activeState.value?.layeredMaps.find(({ id }) => id === groupId) ?? null
  })
  const supportsGravity = computed(() => hasGravityMap(activeState.value))
  const regions = computed(() => selectRegions(dataset.value?.regionLabels ?? [], selectedStateId.value))
  const activeMapName = computed(() => {
    const currentDataset = dataset.value
    return currentDataset ? mapStateName(currentDataset, selectedStateId.value) : ''
  })
  const candidateEchoes = computed(() => selectEchoDefinitions(
    dataset.value?.echoes ?? [], sonataFilterIds.value, echoCostFilters.value, '',
  ))
  const filteredEchoes = computed(() => selectEchoDefinitions(
    candidateEchoes.value, [], [], echoSearch.value,
  ))
  const activeEchoIds = computed<ReadonlySet<string>>(() => selectActiveEchoIds(selectedEchoIds.value))
  const authoredLocations = computed(() => dataset.value
    ? immutableSnapshot(libraryLocations(combinePointLibraries({ ...pointLibrary.value, points: pointLibrary.value.points.filter(({ status }) => status === 'verified') }, officialLibrary.value, pointSource.value), dataset.value))
    : { echoLocations: [], navigationPoints: [], navigationPointGroups: [] })
  const allEchoLocations = computed<readonly EchoMapLocation[]>(() => authoredLocations.value.echoLocations)
  const allNavigationPoints = computed(() => authoredLocations.value.navigationPoints)
  const mapScope = computed(() => ({
    gravityType: supportsGravity.value ? selectedGravity.value : null,
    stateId: selectedStateId.value,
    countryId: selectedCountryId.value,
    levelId: selectedLevelId.value,
  }))
  const visibleEchoLocations = computed(() => selectEchoLocations(
    allEchoLocations.value, mapScope.value, activeEchoIds.value, showProvisional.value,
  ))
  const contextEchoLocations = computed(() => allEchoLocations.value.filter((location) => (
    matchesMapContext(location, mapScope.value)
    && echoMembers(location).some(({ echoId }) => activeEchoIds.value.has(echoId))
    && (showProvisional.value || location.gameCoordinate !== null)
  )))
  // Base-map context remains visible beneath the floor mask; routes keep their exact floor scope.
  const mapEchoLocations = computed(() => selectedLevelId.value === null ? contextEchoLocations.value : [
    ...visibleEchoLocations.value,
    ...selectEchoLocations(allEchoLocations.value, { ...mapScope.value, levelId: null }, activeEchoIds.value, showProvisional.value),
  ])
  const selectedEchoLocation = computed(() => mapEchoLocations.value.find(({ id }) => id === selectedPointId.value) ?? null)
  const selectedNavigationPoint = computed(() => mapNavigationPoints.value.find(({ id }) => id === selectedPointId.value) ?? null)
  const pointCandidates = computed(() => mapEchoLocations.value.filter(({ id }) => candidateIds.value.includes(id)))
  const matchingMonsterCount = computed(() => visibleEchoLocations.value.reduce((sum, location) => sum + echoMembers(location).reduce((count, member) => count + (activeEchoIds.value.has(member.echoId) ? member.count ?? 0 : 0), 0), 0))
  const scopedNavigationPoints = computed(() => (
    allNavigationPoints.value.filter((location) => matchesMapScope(location, mapScope.value))
  ))
  const visibleNavigationPoints = computed(() => scopedNavigationPoints.value)
  // The base map keeps floor navigation markers visible; the renderer badges them as layered points.
  const mapNavigationPoints = computed(() => allNavigationPoints.value.filter((location) => (
    matchesMapContext(location, mapScope.value)
    && (selectedLevelId.value === null
      || location.levelId === null
      || location.levelId === selectedLevelId.value
      || location.mode === 'fast-travel')
  )))
  const visibleRegionLabels = computed(() => selectRegionLabels(dataset.value?.regionLabels ?? [], mapScope.value))
  function hasRouteGravity(point: PointLocationBase): boolean {
    return !supportsGravity.value || point.gravityType === selectedGravity.value
  }
  const routeEligibleLocations = computed(() => visibleEchoLocations.value.filter((point) => hasGameCoordinate(point) && hasRouteGravity(point)))
  const routeEligibleNavigationPoints = computed(() => scopedNavigationPoints.value.filter((point) => isRouteStart(point) && hasRouteGravity(point)))
  const routeGroupCandidates = computed(() => dataset.value ? createRouteGroupCandidates(
    dataset.value, allEchoLocations.value, allNavigationPoints.value, activeEchoIds.value, showProvisional.value,
  ) : [])
  const routePlanEligibleLocations = computed(() => routeGroupCandidates.value.flatMap(({ locations }) => locations))
  const routePlanEligibleNavigationPoints = computed(() => routeGroupCandidates.value.flatMap(({ navigationPoints }) => navigationPoints))
  const mapRoutes = computed<RouteResult[]>(() => {
    if (!routePlan.value || selectedLevelId.value !== null) return route.value ? [route.value] : []
    return routePlan.value.groups.filter(({ stateId, gravityType }) => (
      stateId === selectedStateId.value && gravityType === selectedGravity.value
    )).map(({ route: groupRoute }) => groupRoute)
  })
  const unmarkedGravityCount = computed(() => supportsGravity.value
    ? [...visibleEchoLocations.value, ...scopedNavigationPoints.value].filter(({ gravityType }) => gravityType === null).length : 0)

  function syncRouteFromPlan(): void {
    const plan = routePlan.value
    if (!plan) return
    const gravityType = supportsGravity.value ? selectedGravity.value : 1
    route.value = plan.groups.find(({ id }) => id === routeGroupId(selectedStateId.value, selectedLevelId.value, gravityType))?.route ?? null
    selectedPointId.value = null
    candidateIds.value = immutableSnapshot([])
  }

  function setDataset(value: MapDataset): void {
    clearRoute()
    resetFloorContext()
    selectedLevelId.value = null
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
    resetFloorContext()

    const resolved = resolveExplorerState(currentDataset, state, selectedStateId.value)
    pointSourceFilters.value = immutableSnapshot([...(resolved.pointSourceFilters ?? [])])
    selectedStateId.value = resolved.stateId
    selectedCountryId.value = resolved.countryId
    selectedLevelId.value = resolved.levelId
    compactFloors.value = resolved.compactFloors ?? true
    selectedGravity.value = resolved.gravityType ?? 1
    baseTileError.value = false
    selectedEchoIds.value = immutableSnapshot([...resolved.echoIds])
    sonataFilterIds.value = immutableSnapshot([...resolved.sonataFilterIds])
    echoCostFilters.value = immutableSnapshot([...resolved.echoCostFilters])
    showProvisional.value = resolved.showProvisional
    controlPanelCollapsed.value = resolved.controlPanelCollapsed
    mobileSheet.value = resolved.mobileSheet
    mapViewport.value = immutableSnapshot(resolved.viewport)
    echoSearch.value = ''
    clearRoute()
  }

  function selectState(id: number): void {
    resetFloorContext()
    selectedGravity.value = 1
    baseTileError.value = false
    selectedStateId.value = id
    selectedCountryId.value = null
    selectedLevelId.value = null
    mapViewport.value = null
    if (routePlan.value) syncRouteFromPlan()
    else clearRoute()
  }

  function selectCountry(id: number | null): void {
    selectedCountryId.value = id
    clearRoute()
  }

  function selectGravity(gravity: GravityType): void {
    if ((gravity !== 1 && gravity !== 2) || !supportsGravity.value || selectedGravity.value === gravity) return
    selectedGravity.value = gravity
    baseTileError.value = false
    if (routePlan.value) syncRouteFromPlan()
    else clearRoute()
  }

  function selectLevel(id: string | null): void {
    if (id !== null && !floors.value.some((floor) => floor.id === id)) return
    floorRequest.value = null
    if (selectedLevelId.value === id) return
    selectedLevelId.value = id
    if (routePlan.value) syncRouteFromPlan()
    else clearRoute()
  }

  function resetFloorContext(): void {
    floorViewport.value = null
    floorRequest.value = null
  }

  function setFloorViewport(extent: Extent | null, resolution = 1): void {
    const [left, bottom, right, top] = extent ?? []
    floorViewport.value = left !== undefined && bottom !== undefined && right !== undefined && top !== undefined
      && [left, bottom, right, top, resolution].every(Number.isFinite) && left < right && bottom < top && resolution > 0
      ? immutableSnapshot({ extent: [left, bottom, right, top], resolution }) : null
  }

  function requestLevel(id: string | null): void {
    if (id === null || (id === selectedLevelId.value && !(floorRequest.value?.status === 'error' && floorRequest.value.levelId === id))) {
      selectLevel(id)
      return
    }
    if (!floors.value.some((floor) => floor.id === id) || (floorRequest.value?.levelId === id && floorRequest.value.status === 'loading')) return
    floorRequest.value = immutableSnapshot({ token: ++floorRequestToken, levelId: id, status: 'loading' })
  }

  function completeFloorRequest(token: number): boolean {
    const request = floorRequest.value
    if (request?.token !== token || request.status !== 'loading') return false
    selectLevel(request.levelId)
    return true
  }

  function failFloorRequest(token: number): void {
    if (floorRequest.value?.token !== token) return
    floorRequest.value = immutableSnapshot({ ...floorRequest.value, status: 'error' })
  }

  function reportFloorTileError(levelId: string): void {
    if (selectedLevelId.value === levelId && floorRequest.value === null) {
      floorRequest.value = immutableSnapshot({ token: ++floorRequestToken, levelId, status: 'error' })
    }
  }

  function toggleEcho(id: string): void {
    replaceSelectedEchoes(toggleId(selectedEchoIds.value, id))
  }

  function replaceSelectedEchoes(ids: readonly string[]): void {
    const next = [...new Set(ids)]
    if (next.length === selectedEchoIds.value.length && next.every((id, index) => id === selectedEchoIds.value[index])) return
    selectedEchoIds.value = immutableSnapshot(next)
    clearRoute()
  }

  function selectCandidateEchoes(): void {
    const selected = new Set(selectedEchoIds.value)
    for (const echo of candidateEchoes.value) selected.add(echo.id)
    replaceSelectedEchoes([...selected])
  }

  function deselectCandidateEchoes(): void {
    const candidateEchoIds = new Set(candidateEchoes.value.map(({ id }) => id))
    replaceSelectedEchoes(selectedEchoIds.value.filter((id) => !candidateEchoIds.has(id)))
  }

  function clearSelectedEchoes(): void {
    replaceSelectedEchoes([])
  }

  function navigateToRegion(id: string): void {
    const currentDataset = dataset.value
    const destination = currentDataset?.regionLabels.find((region) => region.id === id)
    if (!destination || !currentDataset?.mapNavigation.some((country) => country.regionIds.includes(id))) return
    resetFloorContext()
    if (selectedStateId.value !== destination.stateId) {
      selectedGravity.value = 1
      baseTileError.value = false
    }
    if (!routePlan.value && (selectedStateId.value !== destination.stateId || selectedCountryId.value !== null || selectedLevelId.value !== null)) clearRoute()
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
    if (routePlan.value) syncRouteFromPlan()
  }

  function completeMapNavigation(): void {
    mapNavigationRequest.value = null
  }

  function setSonataFilters(ids: readonly string[]): void {
    sonataFilterIds.value = immutableSnapshot([...new Set(ids)])
  }

  function setEchoCostFilters(values: readonly EchoCostFilter[]): void {
    echoCostFilters.value = immutableSnapshot(([1, 3] as const).filter((cost) => values.includes(cost)))
  }

  function setEchoSearch(value: string): void {
    echoSearch.value = value
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

  function setMapViewport(value: MapViewportState | null): void {
    mapViewport.value = value === null
      ? null
      : immutableSnapshot({ center: [...value.center], zoom: value.zoom })
  }

  function setRoute(value: RouteResult): void {
    routePlan.value = null
    route.value = immutableSnapshot(value)
  }

  function clearRoute(): void {
    activePlan?.abort()
    activePlan = null
    planning.value = false
    routeError.value = ''
    route.value = null
    routePlan.value = null
    planningCompleted.value = 0
    planningTotal.value = 0
    selectedPointId.value = null
    candidateIds.value = immutableSnapshot([])
  }

  async function planRoute(): Promise<void> {
    if (planning.value || routeEligibleLocations.value.length === 0) {
      return
    }
    clearRoute()
    const controller = new AbortController()
    activePlan = controller
    planning.value = true
    routeError.value = ''
    try {
      const input = createRoutePlanInput(
        dataset.value, routeEligibleLocations.value, routeEligibleNavigationPoints.value,
        selectedStateId.value, activeEchoIds.value,
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

  function activateRouteGroup(id: string): void {
    const planned = routePlan.value?.groups.find((candidate) => candidate.id === id)
    const group = planned ?? routeGroupCandidates.value.find((candidate) => candidate.id === id)
    if (!group) return
    resetFloorContext()
    selectedStateId.value = group.stateId
    selectedCountryId.value = null
    selectedLevelId.value = group.levelId
    selectedGravity.value = group.gravityType
    baseTileError.value = false
    mapViewport.value = null
    route.value = planned?.route ?? null
    selectedPointId.value = null
    candidateIds.value = immutableSnapshot([])
  }

  async function planAllRoutes(): Promise<void> {
    const currentDataset = dataset.value
    const currentId = routeGroupId(selectedStateId.value, selectedLevelId.value, supportsGravity.value ? selectedGravity.value : 1)
    const candidates = routeGroupCandidates.value.filter(({ locations }) => locations.length > 0).sort((left, right) => {
      const priority = (group: { id: string, stateId: number }) => group.id === currentId ? 0 : group.stateId === selectedStateId.value ? 1 : 2
      return priority(left) - priority(right)
    })
    if (planning.value || !currentDataset || candidates.length === 0) return
    clearRoute()
    const controller = new AbortController()
    activePlan = controller
    planning.value = true
    routeError.value = ''
    planningCompleted.value = 0
    planningTotal.value = candidates.length
    try {
      const groups: RoutePlanResult['groups'] = []
      for (const [index, candidate] of candidates.entries()) {
        controller.signal.throwIfAborted()
        const result = await planRouteInWorker(createRoutePlanInput(
          currentDataset, candidate.locations, candidate.navigationPoints, candidate.stateId, activeEchoIds.value,
        ), controller.signal)
        const { locations: _locations, navigationPoints: _navigationPoints, ...metadata } = candidate
        groups.push({ ...metadata, route: result })
        if (activePlan === controller) planningCompleted.value = index + 1
      }
      if (activePlan === controller) {
        routePlan.value = immutableSnapshot({
          groups,
          totalCost: groups.reduce((sum, group) => sum + group.route.totalCost, 0),
          totalPoints: groups.reduce((sum, group) => sum + group.route.points.length, 0),
        })
        const gravityType = supportsGravity.value ? selectedGravity.value : 1
        const activeId = routeGroupId(selectedStateId.value, selectedLevelId.value, gravityType)
        activateRouteGroup(groups.some(({ id }) => id === activeId) ? activeId : groups[0]?.id ?? '')
      }
    } catch (error) {
      if (activePlan === controller) {
        route.value = null
        routePlan.value = null
        routeError.value = error instanceof Error ? error.message : String(error)
      }
    } finally {
      if (activePlan === controller) {
        activePlan = null
        planning.value = false
      }
    }
  }

  function resetEchoFilters(): void {
    sonataFilterIds.value = immutableSnapshot([])
    echoCostFilters.value = immutableSnapshot([])
    echoSearch.value = ''
  }

  return {
    pointSourceFilters: shallowReadonly(pointSourceFilters),
    allEchoLocations, allNavigationPoints, activeEchoIds, matchingMonsterCount, selectedEchoLocation, selectedNavigationPoint,
    setPointLibrary: (value: PointLibrary) => {
      pointLibrary.value = immutableSnapshot(value)
      clearRoute()
    },
    setOfficialPointLibrary: (value: PointLibrary) => {
      officialLibrary.value = immutableSnapshot(value)
      clearRoute()
    },
    setPointSourceFilters: (values: readonly PointSourceFilter[]) => {
      pointSourceFilters.value = immutableSnapshot(
        (['manual', 'official'] as const).filter(source => values.includes(source)),
      )
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
    compactFloors: shallowReadonly(compactFloors),
    toggleFloorLayout: () => { compactFloors.value = !compactFloors.value },
    floorRequest: shallowReadonly(floorRequest),
    displayedFloorGroup, selectedFloor, selectedFloorGroup, nearbyFloorGroups, floorSwitcherVisible,
    setFloorViewport, requestLevel, completeFloorRequest, failFloorRequest, reportFloorTileError,
    selectedGravity: shallowReadonly(selectedGravity),
    supportsGravity, unmarkedGravityCount, selectGravity,
    baseTileError: shallowReadonly(baseTileError),
    baseTileRetry: shallowReadonly(baseTileRetry),
    reportBaseTileError: (failed: boolean) => { baseTileError.value = failed },
    retryBaseTiles: () => { baseTileError.value = false; baseTileRetry.value += 1 },
    selectedEchoIds: shallowReadonly(selectedEchoIds),
    sonataFilterIds: shallowReadonly(sonataFilterIds),
    echoCostFilters: shallowReadonly(echoCostFilters),
    echoSearch: shallowReadonly(echoSearch),
    showProvisional: shallowReadonly(showProvisional),
    controlPanelCollapsed: shallowReadonly(controlPanelCollapsed),
    mobileSheet: shallowReadonly(mobileSheet),
    mapViewport: shallowReadonly(mapViewport),
    mapNavigationRequest: shallowReadonly(mapNavigationRequest),
    activeMapName,
    navigateToRegion,
    completeMapNavigation,
    route: shallowReadonly(route),
    routePlan: shallowReadonly(routePlan),
    planning: shallowReadonly(planning),
    routeError: shallowReadonly(routeError),
    planningCompleted: shallowReadonly(planningCompleted),
    planningTotal: shallowReadonly(planningTotal),
    states,
    activeState,
    floors,
    regions,
    candidateEchoes,
    filteredEchoes,
    visibleEchoLocations,
    visibleNavigationPoints,
    mapEchoLocations,
    mapNavigationPoints,
    visibleRegionLabels,
    routeEligibleLocations,
    routeEligibleNavigationPoints,
    routeGroupCandidates,
    routePlanEligibleLocations,
    routePlanEligibleNavigationPoints,
    mapRoutes,
    setDataset,
    restoreUrlState,
    selectState,
    selectCountry,
    selectLevel,
    toggleEcho,
    selectCandidateEchoes,
    deselectCandidateEchoes,
    clearSelectedEchoes,
    setSonataFilters,
    setEchoCostFilters,
    setEchoSearch,
    setProvisionalVisible,
    toggleControlPanel,
    setMobileSheet,
    planRoute,
    planAllRoutes,
    activateRouteGroup,
    setMapViewport,
    setRoute,
    clearRoute,
    resetEchoFilters,
  }
})
