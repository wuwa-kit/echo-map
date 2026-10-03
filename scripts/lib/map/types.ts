import type { NavigationPointType, PointQuality, RouteConnector } from '../../../src/domain/types.ts'

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

export interface ManualData {
  echoLocations: ManualPoint[]
  connectors: RouteConnector[]
}

export interface AliasData {
  byTypeId: Record<string, string>
}

export interface NavigationConfig {
  includeTableNames: Record<string, NavigationPointType>
  types: Record<string, NavigationPointType>
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
