import type { MapDataset } from '../domain/types.ts'
import { hasGravityMap } from '../domain/gravity.ts'
import { DEFAULT_STATE_ID } from './explorer-url.ts'
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

  return {
    pointSourceFilters: (['manual', 'official'] as const).filter(source => state.pointSourceFilters?.includes(source)),
    stateId,
    gravityType: hasGravityMap(nextState) && state.gravityType === 2 ? 2 : 1,
    countryId: state.countryId !== undefined && countryIds.has(state.countryId) ? state.countryId : null,
    levelId: state.levelId !== undefined && floorIds.has(state.levelId) ? state.levelId : null,
    compactFloors: state.compactFloors !== false,
    echoIds: (state.echoIds ?? []).filter((id) => echoIds.has(id)),
    sonataFilterIds: (state.sonataFilterIds ?? []).filter((id) => sonataIds.has(id)),
    echoCostFilters: ([1, 3] as const).filter((cost) => state.echoCostFilters?.includes(cost)),
    showProvisional: state.showProvisional ?? true,
    controlPanelCollapsed: state.controlPanelCollapsed ?? false,
    mobileSheet: state.mobileSheet === 'filters' ? state.mobileSheet : null,
    viewport: state.viewport ? { center: [...state.viewport.center], zoom: state.viewport.zoom } : null,
  }
}
