import type { MapDataset } from '../domain/types.ts'
import { DEFAULT_ROUTE_Z_WEIGHT, DEFAULT_STATE_ID } from './explorer-url.ts'
import type { ExplorerUrlSnapshot, ExplorerUrlState } from './explorer-url.ts'

export function resolveExplorerState(
  dataset: MapDataset,
  state: ExplorerUrlState,
  fallbackStateId: number,
): ExplorerUrlSnapshot {
  const restoredState = state.stateId === undefined
    ? undefined
    : dataset.states.find(({ id }) => id === state.stateId)
  const nextState = restoredState
    ?? dataset.states.find(({ id }) => id === DEFAULT_STATE_ID)
    ?? dataset.states[0]
  const stateId = nextState?.id ?? fallbackStateId
  const countryIds = new Set(dataset.regionLabels
    .filter((label) => label.level === 1 && label.stateId === stateId)
    .map(({ countryId }) => countryId))
  const floorIds = new Set(nextState?.layeredMaps.flatMap(({ floors }) => floors.map(({ id }) => id)) ?? [])
  const echoIds = new Set(dataset.echoes.map(({ id }) => id))
  const sonataIds = new Set(dataset.sonatas.map(({ id }) => id))
  const pointGroupIds = new Set(dataset.navigationPointGroups.map(({ id }) => id))
  const pointGroupIdByTypeId = new Map(dataset.navigationPoints.map(({ typeId, groupId }) => [typeId, groupId]))

  return {
    pointSource: state.pointSource ?? 'all',
    stateId,
    countryId: state.countryId !== undefined && countryIds.has(state.countryId) ? state.countryId : null,
    levelId: state.levelId !== undefined && floorIds.has(state.levelId) ? state.levelId : null,
    echoIds: (state.echoIds ?? []).filter((id) => echoIds.has(id)),
    sonataIds: (state.sonataIds ?? []).filter((id) => sonataIds.has(id)),
    hiddenPointGroupIds: [...new Set((state.hiddenPointGroupIds ?? []).flatMap((id) => {
      if (pointGroupIds.has(id)) {
        return [id]
      }
      const legacyGroupId = pointGroupIdByTypeId.get(id)
      return legacyGroupId ? [legacyGroupId] : []
    }))],
    showProvisional: state.showProvisional ?? true,
    controlPanelCollapsed: state.controlPanelCollapsed ?? false,
    mobileSheet: state.mobileSheet === 'filters' || state.mobileSheet === 'route' ? state.mobileSheet : null,
    routeZWeight: state.routeZWeight !== undefined && state.routeZWeight >= 0.1 && state.routeZWeight <= 10
      ? state.routeZWeight
      : DEFAULT_ROUTE_Z_WEIGHT,
    viewport: state.viewport ? { center: [...state.viewport.center], zoom: state.viewport.zoom } : null,
  }
}
