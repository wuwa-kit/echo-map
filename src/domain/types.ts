import type { navigationPointTypes } from './navigation-point-types.ts'

export type NonEmptyArray<T> = [T, ...T[]]

export type PointQuality = 'official-provisional' | 'manual' | 'example'

export type GravityType = 1 | 2

export interface SonataEffect {
  id: string
  name: string
  iconUrl: string
  sourceId: number
  c1EchoIds: string[]
  c3EchoIds: string[]
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

export interface AuthoredCoordinate {
  x: number | null
  y: number | null
  z: number | null
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

export interface FloorCoverageTile {
  tile: string
  size: number
  // Row-major occupied pixel intervals, inclusive start and exclusive end.
  runs: [number, number][]
}

export interface LayeredMapDefinition {
  id: string
  name: string
  floors: MapFloorDefinition[]
  coverage: FloorCoverageTile[]
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
  gravityTiles: string[]
  tileExtent: TileExtent
  layeredMaps: LayeredMapDefinition[]
}

export interface MapLocationBase {
  id: string
  stateId: number
  countryId: number | null
  coordinate: OfficialCoordinate
}

// Text-only navigation anchors do not carry game height or route eligibility.
export interface RegionLabel extends MapLocationBase {
  name: string
  countryId: number
  level: number
}

export interface MapNavigationCountry {
  id: number
  name: string
  regionIds: string[]
  groups: {
    id: string
    name: string
    regionIds: string[]
  }[]
}

export interface PointLocationBase extends MapLocationBase {
  gravityType: GravityType | null
  typeId: string
  typeName: string
  iconUrl: string
  layeredMapId: string | null
  levelId: string | null
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
  gravityType: GravityType | null
  id: string
  officialIds?: string[]
  replacesOfficialIds?: string[]
  stateId: number
  levelId: string | null
  coordinate: AuthoredCoordinate
  note?: string
}

export type PointFileRevisions = Record<string, string>
export type PointLibraryRevision = string | PointFileRevisions

export interface PointLibraryChanges {
  edits: { before: AuthoredPoint | null; after: AuthoredPoint | null }[]
  replaceAll: boolean
}

export interface AuthoredEchoPoint extends AuthoredPointBase {
  kind: 'echo'
  members: EchoMember[]
  compositionStatus?: 'partial' | 'complete'
}

export type NavigationPointType = keyof typeof navigationPointTypes

export type MapDisplayTier = 'always' | 'far' | 'near'

export interface NavigationIconDefinition {
  id: string
  name: string
  url: string
}

export interface NavigationTypeDefinition {
  name: string
  kind: NavigationKind
  defaultMode: NavigationMode
  teleportLocked: boolean
  // IDs belong to the local icon catalogue; an empty list permits custom icons.
  icons: readonly string[]
  // Names are either custom (empty) or fixed (one value), never selectable.
  names: readonly [] | readonly [string]
  displayTier: MapDisplayTier
}

export interface AuthoredNavigationPoint extends AuthoredPointBase {
  kind: 'navigation'
  name: string
  navigationKind: NavigationKind
  pointType?: NavigationPointType
  displayTier?: MapDisplayTier
  iconId?: string
  iconUrl?: string
  mode: NavigationMode
  teleportCoordinate?: AuthoredCoordinate
}

export type AuthoredPoint = AuthoredEchoPoint | AuthoredNavigationPoint

export interface PointLibrary {
  version: 1
  points: AuthoredPoint[]
}

export interface LocalPointChange {
  id: string
  before: AuthoredPoint | null
  after: AuthoredPoint | null
  needsReview: boolean
}

export interface PointWorkspace {
  version: 1
  published: PointLibrary
  changes: LocalPointChange[]
}

export type LocalPointOperation = 'added' | 'modified' | 'deleted'
export type LocalPointStatus = 'pending' | 'adopted' | 'conflict' | 'review'

export interface PointManagementRow {
  id: string
  point: AuthoredPoint
  before: AuthoredPoint | null
  local: AuthoredPoint | null
  published: AuthoredPoint | null
  operation: LocalPointOperation | null
  status: LocalPointStatus | 'published'
  duplicateIds: string[]
}

export interface AuthoredEchoLocation extends PointLocationBase {
  members: EchoMember[]
  note: string
  compositionStatus?: 'partial' | 'complete'
}

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
  pointType?: NavigationPointType
  displayTier?: MapDisplayTier
  groupId: string
  catalogCategoryId: string
  catalogCategoryName: string
  mode: NavigationMode
  kind: NavigationKind
  teleportCoordinate?: GameCoordinate
}

export type MapDisplayPoint =
  | { category: 'echo', location: EchoMapLocation }
  | { category: 'navigation', location: NavigationPoint }
  | { category: 'region-name', location: RegionLabel }

// Inclusive minimum, exclusive maximum; null keeps a point visible when zooming in.
export interface MapZoomRange {
  minZoom: number
  maxZoom: number | null
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
}

export interface MapDataset {
  version: 3
  source: SourceManifest
  report: SyncReport
  sonatas: SonataEffect[]
  echoes: EchoDefinition[]
  states: MapStateDefinition[]
  mapNavigation: MapNavigationCountry[]
  regionLabels: RegionLabel[]
  echoLocations: EchoLocation[]
  navigationPointGroups: NavigationPointGroup[]
  navigationPoints: NavigationPoint[]
  connectors: RouteConnector[]
}

export interface MapPointLocations {
  echoLocations: Omit<EchoLocation, 'iconUrl'>[]
}

export interface MapData extends Pick<MapDataset, 'version' | 'states' | 'mapNavigation' | 'regionLabels' | 'connectors'> {
  source: Omit<SourceManifest, 'wikiFetchedAt' | 'sourceUrls'> & {
    sourceUrls: Pick<SourceManifest['sourceUrls'], 'officialMap'>
  }
}

export interface MapCatalogData extends Pick<MapDataset, 'report' | 'sonatas' | 'echoes'> {
  source: Pick<SourceManifest, 'wikiFetchedAt'> & {
    sourceUrls: Pick<SourceManifest['sourceUrls'], 'echoCatalogue' | 'sonataCatalogue'>
  }
}

export interface OfficialEchoPointData {
  locations: MapPointLocations['echoLocations']
  library: PointLibrary
}

export type OfficialAssetCategory = 'echo' | 'sonata' | 'navigation' | 'exploration' | 'challenge' | 'service' | 'tile' | 'floor' | 'gravity'

export interface OfficialAsset {
  id: string
  category: OfficialAssetCategory
  categories: OfficialAssetCategory[]
  name: string
  url: string
  previewUrl: string
  sourceUrl: string
  fetchedAt: string
  stateIds: number[]
  referenceIds: string[]
  tags: string[]
  recordCount: number
}

export interface RoutePoint {
  id: string
  name: string
  echoId: string | null
  stateId: number
  levelId: string | null
  coordinate: GameCoordinate
  mapCoordinate: [number, number]
  isTeleportArrival?: true
  members?: {
    echoId: string
    name: string
    count: number
  }[]
}

export interface RouteResult {
  points: (RoutePoint & { teleportFrom?: RoutePoint })[]
  totalCost: number
  algorithm: 'exact' | 'nearest-neighbor-2opt'
  startPointId: string | null
}

export interface RoutePlanGroup {
  id: string
  stateId: number
  levelId: string | null
  gravityType: GravityType
  label: string
  mapName: string
  echoCount: number
  matchingLocationCount: number
  incompleteLocationCount: number
  route: RouteResult
}

export interface RoutePlanResult {
  groups: RoutePlanGroup[]
  totalCost: number
  totalPoints: number
}

export interface OfficialMapAssetCatalog {
  version: 1
  resourceHash: string
  assets: OfficialAsset[]
}
