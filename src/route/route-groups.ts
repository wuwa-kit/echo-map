import type { EchoMapLocation, GravityType, MapDataset, NavigationPoint, RoutePlanGroup } from '../domain/types.ts'
import { gravityName, hasGravityMap } from '../domain/gravity.ts'
import { echoMembers, navigationRouteCoordinate } from '../domain/point-library.ts'
import { DEFAULT_STATE_ID } from '../url/explorer-url.ts'

export interface RouteGroupCandidate extends Omit<RoutePlanGroup, 'route'> {
  locations: EchoMapLocation[]
  navigationPoints: NavigationPoint[]
}

export interface EchoLocationCoverage {
  current: number
  total: number
  stateCount: number
}

export function routeGroupId(stateId: number, levelId: string | null, gravityType: GravityType): string {
  return `${stateId}:${levelId ?? 'base'}:${gravityType}`
}

export function mapStateName(dataset: Pick<MapDataset, 'states' | 'mapNavigation' | 'regionLabels'>, stateId: number): string {
  const state = dataset.states.find(({ id }) => id === stateId)
  if (!state) return `地图 ${stateId}`
  const labels = new Map(dataset.regionLabels.map((label) => [label.id, label]))
  const matchingGroups = dataset.mapNavigation.flatMap((country) => country.groups.filter((group) => (
    group.regionIds.length > 0 && group.regionIds.every((id) => labels.get(id)?.stateId === state.id)
  )))
  return matchingGroups.length === 1 ? matchingGroups[0]?.name ?? state.name
    : state.id === DEFAULT_STATE_ID ? '地表地图' : state.name
}

function groupLabel(dataset: MapDataset, stateId: number, levelId: string | null, gravityType: GravityType): { label: string, mapName: string } {
  const state = dataset.states.find(({ id }) => id === stateId)
  const mapName = mapStateName(dataset, stateId)
  const floor = state?.layeredMaps.flatMap(({ floors }) => floors).find(({ id }) => id === levelId)
  const parts = [mapName]
  if (floor) parts.push(floor.name)
  if (hasGravityMap(state)) parts.push(gravityName(gravityType))
  return { label: parts.join(' · '), mapName }
}

function locationGravity(dataset: MapDataset, location: EchoMapLocation | NavigationPoint): GravityType {
  const state = dataset.states.find(({ id }) => id === location.stateId)
  return hasGravityMap(state) && location.gravityType === 2 ? 2 : 1
}

function contextOrder(dataset: MapDataset, group: Pick<RouteGroupCandidate, 'stateId' | 'levelId' | 'gravityType'>): [number, number, number] {
  const stateIndex = Math.max(0, dataset.states.findIndex(({ id }) => id === group.stateId))
  const state = dataset.states[stateIndex]
  const floors = state?.layeredMaps.flatMap(({ floors: values }) => values) ?? []
  const floorIndex = group.levelId === null ? -1 : floors.findIndex(({ id }) => id === group.levelId)
  return [stateIndex, floorIndex, group.gravityType]
}

export function createRouteGroupCandidates(
  dataset: MapDataset,
  locations: readonly EchoMapLocation[],
  navigationPoints: readonly NavigationPoint[],
  activeEchoIds: ReadonlySet<string>,
  showProvisional: boolean,
): RouteGroupCandidate[] {
  const groups = new Map<string, RouteGroupCandidate>()
  const echoIdsByGroup = new Map<string, Set<string>>()
  for (const location of locations) {
    const members = echoMembers(location).filter(({ echoId }) => activeEchoIds.has(echoId))
    if (members.length === 0 || (!showProvisional && location.gameCoordinate === null)) continue
    const gravityType = locationGravity(dataset, location)
    const id = routeGroupId(location.stateId, location.levelId, gravityType)
    let group = groups.get(id)
    if (!group) {
      const names = groupLabel(dataset, location.stateId, location.levelId, gravityType)
      group = {
        id, stateId: location.stateId, levelId: location.levelId, gravityType, ...names,
        echoCount: 0, matchingLocationCount: 0, incompleteLocationCount: 0,
        locations: [], navigationPoints: [],
      }
      groups.set(id, group)
      echoIdsByGroup.set(id, new Set())
    }
    for (const { echoId } of members) echoIdsByGroup.get(id)?.add(echoId)
    group.matchingLocationCount += 1
    const state = dataset.states.find(({ id: stateId }) => stateId === location.stateId)
    const eligible = location.gameCoordinate !== null && (!hasGravityMap(state) || location.gravityType === gravityType)
    if (eligible) group.locations.push(location)
    else group.incompleteLocationCount += 1
  }

  for (const group of groups.values()) {
    group.echoCount = echoIdsByGroup.get(group.id)?.size ?? 0
    const state = dataset.states.find(({ id }) => id === group.stateId)
    group.navigationPoints = navigationPoints.filter((point) => (
      point.stateId === group.stateId
      && point.levelId === group.levelId
      && point.mode === 'fast-travel'
      && navigationRouteCoordinate(point) !== null
      && (!hasGravityMap(state) || point.gravityType === group.gravityType)
    ))
  }

  return [...groups.values()].sort((left, right) => {
    const a = contextOrder(dataset, left)
    const b = contextOrder(dataset, right)
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  })
}

export function echoLocationCoverage(
  locations: readonly EchoMapLocation[],
  currentStateId: number,
  currentGravity: GravityType,
  dataset: Pick<MapDataset, 'states'>,
): Map<string, EchoLocationCoverage> {
  const totals = new Map<string, { current: number, total: number, states: Set<number> }>()
  const currentState = dataset.states.find(({ id }) => id === currentStateId)
  for (const location of locations) {
    for (const { echoId } of echoMembers(location)) {
      const value = totals.get(echoId) ?? { current: 0, total: 0, states: new Set<number>() }
      value.total += 1
      value.states.add(location.stateId)
      if (location.stateId === currentStateId && (!hasGravityMap(currentState)
        || location.gravityType === currentGravity || (currentGravity === 1 && location.gravityType === null))) value.current += 1
      totals.set(echoId, value)
    }
  }
  return new Map([...totals].map(([echoId, value]) => [echoId, {
    current: value.current, total: value.total, stateCount: value.states.size,
  }]))
}
