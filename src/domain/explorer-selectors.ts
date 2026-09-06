import type { EchoDefinition, EchoMapLocation, GravityType, NavigationPoint, PointLocationBase, RegionLabel } from './types.ts'
import { matchesGravity } from './gravity.ts'
import { echoMembers } from './point-library.ts'

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
  searchText: string,
): EchoDefinition[] {
  const selectedSet = new Set(sonataIds)
  const search = searchText.trim().toLocaleLowerCase('zh-CN')
  return echoes.filter((echo) => {
    const matchesSonata = selectedSet.size === 0 || echo.sonataIds.some((id) => selectedSet.has(id))
    return matchesSonata && (search.length === 0 || echo.name.toLocaleLowerCase('zh-CN').includes(search))
  })
}

export function selectActiveEchoIds(
  echoes: readonly EchoDefinition[],
  echoIds: readonly string[],
  sonataIds: readonly string[],
): Set<string> {
  if (echoIds.length > 0) {
    return new Set(echoIds)
  }
  const selectedSet = new Set(sonataIds)
  return new Set(echoes
    .filter((echo) => echo.sonataIds.some((id) => selectedSet.has(id)))
    .map(({ id }) => id))
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
  return location.mode === 'fast-travel' && hasGameCoordinate(location)
}
