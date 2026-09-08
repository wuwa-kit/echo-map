import type { EchoDefinition, EchoMapLocation, GravityType, NavigationPoint, PointLocationBase, RegionLabel } from './types.ts'
import { matchesGravity } from './gravity.ts'
import { echoMembers, navigationRouteCoordinate } from './point-library.ts'

type MapScope = Pick<PointLocationBase, 'stateId' | 'countryId' | 'levelId'> & { gravityType?: GravityType | null }

export function selectRegions(labels: readonly RegionLabel[], stateId: number): RegionLabel[] {
  const seen = new Set<number>()
  return labels.filter((label) => {
    if (label.level !== 1 || label.stateId !== stateId || seen.has(label.countryId)) {
      return false
    }
    seen.add(label.countryId)
    return true
  })
}

export function selectEchoDefinitions(
  echoes: readonly EchoDefinition[],
  sonataIds: readonly string[],
  costs: readonly EchoDefinition['cost'][],
  searchText: string,
): EchoDefinition[] {
  const selectedSet = new Set(sonataIds)
  const selectedCosts = new Set(costs)
  const search = searchText.trim().toLocaleLowerCase('zh-CN')
  return echoes.filter((echo) => {
    const matchesSonata = selectedSet.size === 0 || echo.sonataIds.some((id) => selectedSet.has(id))
    const matchesCost = selectedCosts.size === 0 || selectedCosts.has(echo.cost)
    return matchesSonata && matchesCost && (search.length === 0 || echo.name.toLocaleLowerCase('zh-CN').includes(search))
  })
}

export function selectActiveEchoIds(
  echoIds: readonly string[],
): Set<string> {
  return new Set(echoIds)
}

export function matchesMapContext(location: MapScope, scope: MapScope): boolean {
  return location.stateId === scope.stateId
    && (scope.countryId === null || location.countryId === scope.countryId)
    && matchesGravity(location.gravityType, scope.gravityType)
}

export function matchesMapScope(location: MapScope, scope: MapScope): boolean {
  return matchesMapContext(location, scope) && location.levelId === scope.levelId
}

export function selectEchoLocations(
  locations: readonly EchoMapLocation[],
  scope: MapScope,
  activeEchoIds: ReadonlySet<string>,
  showProvisional: boolean,
): EchoMapLocation[] {
  return locations.filter((location) => (
    matchesMapScope(location, scope)
    && echoMembers(location).some(({ echoId }) => activeEchoIds.has(echoId))
    && (showProvisional || location.gameCoordinate !== null)
  ))
}

export function selectRegionLabels(labels: readonly RegionLabel[], scope: MapScope): RegionLabel[] {
  return labels.filter((label) => (
    label.stateId === scope.stateId
    && (scope.countryId === null || label.countryId === scope.countryId)
  ))
}

export function hasGameCoordinate(location: PointLocationBase): boolean {
  return location.gameCoordinate !== null
}

export function isRouteStart(location: NavigationPoint): boolean {
  return location.mode === 'fast-travel' && navigationRouteCoordinate(location) !== null
}
