import type { GameCoordinate, NavigationKind, NavigationMode, NavigationPoint, NavigationPointGroup, PointQuality, RouteConnector } from '../../../src/domain/types.ts'

export interface ManualPoint {
  gravityType?: 1 | 2 | null
  id: string
  officialLocationId?: string
  echoName?: string
  stateId: number
  countryId: number | null
  levelId: string | null
  x: number
  y: number
  z: number
  quality: Exclude<PointQuality, 'official-provisional'>
  note: string
}

export interface ManualNavigationPoint extends ManualPoint {
  teleportCoordinate?: GameCoordinate
}

export interface ManualData {
  echoLocations: ManualPoint[]
  navigationPoints: ManualNavigationPoint[]
  connectors: RouteConnector[]
}

export interface AliasData {
  byTypeId: Record<string, string>
}

export interface NavigationRule {
  mode: NavigationMode
  kind: NavigationKind
}

export interface NavigationConfig {
  includeTableNames: Record<string, NavigationRule>
  types: Record<string, NavigationRule>
}

export interface NavigationGroupConfig {
  namesByHash: Record<string, string>
}

export type NavigationPointDraft = Omit<NavigationPoint, 'groupId'>

export interface NavigationGroupingResult {
  points: NavigationPoint[]
  groups: NavigationPointGroup[]
  iconFetchFailureCount: number
}

export interface CatalogTypeInfo {
  categoryId: string
  categoryName: string
  tableName: string
}

export interface MapConfiguration {
  resourceHash: string
  states: { id: number; name: string }[]
  tileIdsByState: Record<string, string[]>
}

export interface MapStatePayload {
  state: { id: number; name: string }
  positionData: unknown
  layerData: unknown
  catalogData: unknown
  gravityData: unknown
}
