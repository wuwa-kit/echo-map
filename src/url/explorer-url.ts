import type { GravityType, PointSourceFilter } from '../domain/types.ts'

export const DEFAULT_STATE_ID = 8
export const DEFAULT_ROUTE_Z_WEIGHT = 1.35
const WIKI_SONATA_ID_PREFIX = 'wiki-sonata-'
const WIKI_SONATA_ID_PATTERN = /^wiki-sonata-(\d+)$/u

export type MobileSheet = 'filters' | 'route' | null
export type EchoCostFilter = 1 | 3

export interface MapViewportState {
  center: [number, number]
  zoom: number
}

export interface ExplorerUrlState {
  gravityType?: GravityType
  pointSourceFilters?: PointSourceFilter[]
  stateId?: number
  countryId?: number
  levelId?: string
  compactFloors?: boolean
  echoIds?: string[]
  sonataFilterIds?: string[]
  echoCostFilters?: EchoCostFilter[]
  hiddenPointGroupIds?: string[]
  showProvisional?: boolean
  controlPanelCollapsed?: boolean
  mobileSheet?: MobileSheet
  routeZWeight?: number
  viewport?: MapViewportState
}

export interface ExplorerUrlSnapshot {
  gravityType?: GravityType
  pointSourceFilters?: readonly PointSourceFilter[]
  stateId: number
  countryId: number | null
  levelId: string | null
  compactFloors?: boolean
  echoIds: readonly string[]
  sonataFilterIds: readonly string[]
  echoCostFilters: readonly EchoCostFilter[]
  hiddenPointGroupIds: readonly string[]
  showProvisional: boolean
  controlPanelCollapsed: boolean
  mobileSheet: MobileSheet
  routeZWeight: number
  viewport: MapViewportState | null
}

export type ExplorerQueryValue = string | string[] | null | undefined

export interface ExplorerQueryValues {
  gravity?: ExplorerQueryValue
  sources?: ExplorerQueryValue
  map?: ExplorerQueryValue
  region?: ExplorerQueryValue
  floor?: ExplorerQueryValue
  floorStyle?: ExplorerQueryValue
  echoes?: ExplorerQueryValue
  sonatas?: ExplorerQueryValue
  costs?: ExplorerQueryValue
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

function sonataIdList(value: ExplorerQueryValue): string[] | undefined {
  const ids = idList(value)?.filter((id) => /^\d+$/u.test(id)).map((id) => `${WIKI_SONATA_ID_PREFIX}${id}`)
  return ids && ids.length > 0 ? ids : undefined
}

function compactSonataIdList(ids: readonly string[]): string | undefined {
  const sourceIds = ids.flatMap((id) => {
    const match = id.match(WIKI_SONATA_ID_PATTERN)
    return match?.[1] ? [match[1]] : []
  })
  return sourceIds.length > 0 ? [...new Set(sourceIds)].join(',') : undefined
}

function costList(value: ExplorerQueryValue): EchoCostFilter[] | undefined {
  const selected = new Set(idList(value))
  const values = ([1, 3] as const).filter((cost) => selected.has(String(cost)))
  return values && values.length > 0 ? values : undefined
}

function pointSourceList(value: ExplorerQueryValue): PointSourceFilter[] | undefined {
  const selected = new Set(idList(value))
  const sources = (['manual', 'official'] as const).filter(source => selected.has(source))
  return sources.length > 0 ? sources : undefined
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
    pointSourceFilters: pointSourceList(values.sources),
    stateId: integer(values.map),
    gravityType: single(values.gravity) === '2' ? 2 : 1,
    countryId: integer(values.region),
    levelId: single(values.floor),
    compactFloors: single(values.floorStyle) === 'icons',
    echoIds: idList(values.echoes),
    sonataFilterIds: sonataIdList(values.sonatas),
    echoCostFilters: costList(values.costs),
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
    sources: state.pointSourceFilters && state.pointSourceFilters.length > 0
      ? state.pointSourceFilters.join(',')
      : undefined,
    map: state.stateId === DEFAULT_STATE_ID ? undefined : String(state.stateId),
    gravity: state.gravityType === 2 ? '2' : undefined,
    region: state.countryId === null ? undefined : String(state.countryId),
    floor: state.levelId ?? undefined,
    floorStyle: state.compactFloors ? 'icons' : undefined,
    echoes: state.echoIds.length > 0 ? state.echoIds.join(',') : undefined,
    sonatas: compactSonataIdList(state.sonataFilterIds),
    costs: state.echoCostFilters.length > 0 ? state.echoCostFilters.join(',') : undefined,
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
