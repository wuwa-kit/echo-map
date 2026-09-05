export const DEFAULT_STATE_ID = 8
export const DEFAULT_ROUTE_Z_WEIGHT = 1.35

export type MobileSheet = 'filters' | 'route' | null

export interface MapViewportState {
  center: [number, number]
  zoom: number
}

export interface ExplorerUrlState {
  stateId?: number
  countryId?: number
  levelId?: string
  echoIds?: string[]
  sonataIds?: string[]
  hiddenPointGroupIds?: string[]
  showProvisional?: boolean
  controlPanelCollapsed?: boolean
  mobileSheet?: MobileSheet
  routeZWeight?: number
  viewport?: MapViewportState
}

export interface ExplorerUrlSnapshot {
  stateId: number
  countryId: number | null
  levelId: string | null
  echoIds: readonly string[]
  sonataIds: readonly string[]
  hiddenPointGroupIds: readonly string[]
  showProvisional: boolean
  controlPanelCollapsed: boolean
  mobileSheet: MobileSheet
  routeZWeight: number
  viewport: MapViewportState | null
}

export type ExplorerQueryValue = string | string[] | null | undefined

export interface ExplorerQueryValues {
  map?: ExplorerQueryValue
  region?: ExplorerQueryValue
  floor?: ExplorerQueryValue
  echoes?: ExplorerQueryValue
  sonatas?: ExplorerQueryValue
  hiddenTypes?: ExplorerQueryValue
  provisional?: ExplorerQueryValue
  panel?: ExplorerQueryValue
  sheet?: ExplorerQueryValue
  height?: ExplorerQueryValue
  x?: ExplorerQueryValue
  y?: ExplorerQueryValue
  zoom?: ExplorerQueryValue
}

export type ExplorerSerializedQueryValues = {
  [Key in keyof ExplorerQueryValues]: string | undefined
}

function single(value: ExplorerQueryValue): string | undefined {
  const item = Array.isArray(value) ? value[0] : value
  return item?.trim() || undefined
}

function finiteNumber(value: ExplorerQueryValue): number | undefined {
  const item = single(value)
  if (item === undefined) {
    return undefined
  }
  const number = Number(item)
  return Number.isFinite(number) ? number : undefined
}

function integer(value: ExplorerQueryValue): number | undefined {
  const number = finiteNumber(value)
  return number !== undefined && Number.isInteger(number) ? number : undefined
}

function booleanFlag(value: ExplorerQueryValue): boolean | undefined {
  const item = single(value)
  return item === '1' ? true : item === '0' ? false : undefined
}

function idList(value: ExplorerQueryValue): string[] | undefined {
  const item = single(value)
  if (!item) {
    return undefined
  }
  const ids = [...new Set(item.split(',').map((id) => id.trim()).filter(Boolean))]
  return ids.length > 0 ? ids : undefined
}

function compactNumber(value: number, fractionDigits: number): string {
  return String(Number(value.toFixed(fractionDigits)))
}

export function parseExplorerQueryValues(values: ExplorerQueryValues): ExplorerUrlState {
  const x = finiteNumber(values.x)
  const y = finiteNumber(values.y)
  const zoom = finiteNumber(values.zoom)
  const sheet = single(values.sheet)
  return {
    stateId: integer(values.map),
    countryId: integer(values.region),
    levelId: single(values.floor),
    echoIds: idList(values.echoes),
    sonataIds: idList(values.sonatas),
    hiddenPointGroupIds: idList(values.hiddenTypes),
    showProvisional: booleanFlag(values.provisional),
    controlPanelCollapsed: booleanFlag(values.panel),
    mobileSheet: sheet === 'filters' || sheet === 'route' ? sheet : null,
    routeZWeight: finiteNumber(values.height),
    viewport: x !== undefined && y !== undefined && zoom !== undefined
      ? { center: [x, y], zoom }
      : undefined,
  }
}

export function createExplorerQueryValues(state: ExplorerUrlSnapshot): ExplorerSerializedQueryValues {
  return {
    map: state.stateId === DEFAULT_STATE_ID ? undefined : String(state.stateId),
    region: state.countryId === null ? undefined : String(state.countryId),
    floor: state.levelId ?? undefined,
    echoes: state.echoIds.length > 0 ? state.echoIds.join(',') : undefined,
    sonatas: state.sonataIds.length > 0 ? state.sonataIds.join(',') : undefined,
    hiddenTypes: state.hiddenPointGroupIds.length > 0
      ? [...state.hiddenPointGroupIds].sort().join(',')
      : undefined,
    provisional: state.showProvisional ? undefined : '0',
    panel: state.controlPanelCollapsed ? '1' : undefined,
    sheet: state.mobileSheet ?? undefined,
    height: state.routeZWeight === DEFAULT_ROUTE_Z_WEIGHT
      ? undefined
      : compactNumber(state.routeZWeight, 2),
    x: state.viewport ? compactNumber(state.viewport.center[0], 2) : undefined,
    y: state.viewport ? compactNumber(state.viewport.center[1], 2) : undefined,
    zoom: state.viewport ? compactNumber(state.viewport.zoom, 4) : undefined,
  }
}
