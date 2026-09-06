export type NonEmptyArray<T> = [T, ...T[]]

export type PointQuality = 'official-provisional' | 'manual-verified' | 'example'

export interface SonataEffect {
  id: string
  name: string
  iconUrl: string
  sourceId: number
}

export interface EchoDefinition {
  id: string
  name: string
  iconUrl: string
  sonataIds: NonEmptyArray<string>
  cost: 1 | 3
  sourceId: number
}

export interface GameCoordinate {
  x: number
  y: number
  z: number
}

export interface OfficialCoordinate {
  rawX: number
  rawY: number
  mapX: number
  mapY: number
}

export interface MapFloorDefinition {
  id: string
  name: string
  layeredMapId: string
  tiles: string[]
}

export interface LayeredMapDefinition {
  id: string
  name: string
  floors: MapFloorDefinition[]
}

export interface TileExtent {
  minTileX: number
  minTileY: number
  maxTileX: number
  maxTileY: number
  extent: [number, number, number, number]
}

export interface MapStateDefinition {
  id: number
  name: string
  tileIds: string[]
  tileExtent: TileExtent
  layeredMaps: LayeredMapDefinition[]
}

export interface RegionLabel {
  id: string
  name: string
  stateId: number
  countryId: number
  level: number
  coordinate: OfficialCoordinate
}

export interface PointLocationBase {
  id: string
  typeId: string
  typeName: string
  iconUrl: string
  stateId: number
  countryId: number | null
  layeredMapId: string | null
  levelId: string | null
  coordinate: OfficialCoordinate
  gameCoordinate: GameCoordinate | null
  quality: PointQuality
}

export interface EchoLocation extends PointLocationBase {
  echoId: string
}

export interface EchoMember {
  echoId: string
  count: number
}

export interface AuthoredPointBase {
  id: string
  status: 'draft' | 'verified' | 'imported'
  officialIds?: string[]
  replacesOfficialIds?: string[]
  stateId: number
  countryId: number | null
  levelId: string | null
  coordinate: {
    x: number | null
    y: number | null
    z: number | null
  }
  note: string
}

export interface AuthoredEchoPoint extends AuthoredPointBase {
  kind: 'echo'
  members: EchoMember[]
  compositionStatus?: 'partial' | 'complete'
}

export interface AuthoredNavigationPoint extends AuthoredPointBase {
  kind: 'navigation'
  name: string
  navigationKind: NavigationKind
  mode: NavigationMode
}

export type AuthoredPoint = AuthoredEchoPoint | AuthoredNavigationPoint

export interface PointLibrary {
  version: 1
  points: AuthoredPoint[]
}

export interface AuthoredEchoLocation extends PointLocationBase {
  members: EchoMember[]
  note: string
  compositionStatus?: 'partial' | 'complete'
}

export type PointSource = 'all' | 'manual' | 'official'

export type EchoMapLocation = EchoLocation | AuthoredEchoLocation

export type NavigationMode = 'fast-travel' | 'local-transit' | 'entrance' | 'landmark' | 'unknown'

export type NavigationKind =
  | 'nexus'
  | 'beacon'
  | 'tacet-field'
  | 'training-ground'
  | 'hologram'
  | 'boss'
  | 'domain'
  | 'endgame'
  | 'challenge'
  | 'service'
  | 'local-transit'
  | 'entrance'
  | 'landmark'
  | 'unknown'

export interface NavigationPoint extends PointLocationBase {
  groupId: string
  catalogCategoryId: string
  catalogCategoryName: string
  mode: NavigationMode
  kind: NavigationKind
}

export interface NavigationPointGroup {
  id: string
  name: string
  iconUrl: string
  iconHash: string | null
  typeIds: string[]
  typeNames: string[]
  modes: NavigationMode[]
  kinds: NavigationKind[]
}

export interface RouteConnector {
  id: string
  name: string
  stateId: number
  fromLevelId: string
  toLevelId: string
  from: GameCoordinate
  to: GameCoordinate
  traversalCost: number
  isExample: boolean
}

export interface SourceManifest {
  generatedAt: string
  wikiFetchedAt: string
  mapFetchedAt: string
  mapResourceHash: string
  tileWidth: number
  coordinateRate: number
  coordinateScaleBase: number
  sourceUrls: {
    echoCatalogue: string
    sonataCatalogue: string
    officialMap: string
  }
}

export interface SyncReport {
  wikiEchoCount: number
  includedEchoCount: number
  excludedEchoCount: number
  sonataCount: number
  exactMatchedEchoCount: number
  aliasMatchedEchoCount: number
  unmatchedEchoNames: string[]
  provisionalEchoLocationCount: number
  routeEligibleEchoLocationCount: number
  navigationPointCount: number
  navigationPointGroupCount: number
  bossNavigationPointCount: number
  challengeNavigationPointCount: number
  navigationIconFetchFailureCount: number
  routeEligibleNavigationPointCount: number
}

export interface MapDataset {
  version: 3
  source: SourceManifest
  report: SyncReport
  sonatas: SonataEffect[]
  echoes: EchoDefinition[]
  states: MapStateDefinition[]
  regionLabels: RegionLabel[]
  echoLocations: EchoLocation[]
  navigationPointGroups: NavigationPointGroup[]
  navigationPoints: NavigationPoint[]
  connectors: RouteConnector[]
}

export interface RoutePoint {
  id: string
  name: string
  echoId: string | null
  stateId: number
  levelId: string | null
  coordinate: GameCoordinate
  mapCoordinate: [number, number]
  members?: {
    echoId: string
    name: string
    count: number
  }[]
}

export interface RouteResult {
  points: RoutePoint[]
  totalCost: number
  algorithm: 'exact' | 'nearest-neighbor-2opt'
  startPointId: string | null
}
