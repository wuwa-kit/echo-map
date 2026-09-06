import type { MapDisplayPoint, MapZoomRange, NavigationKind, NavigationPoint } from '../domain/types.ts'

// A display zoom measures actual map scale, independently of each base map's View/URL zoom.
export const MAP_ZOOM_BASE_RESOLUTION = 64
export const MAP_ZOOM_LEVELS = {
  world: { name: '全图', minZoom: 0 },
  overview: { name: '远景', minZoom: 1 },
  region: { name: '区域', minZoom: 2 },
  surroundings: { name: '周边', minZoom: 3 },
  local: { name: '局部', minZoom: 4 },
  detail: { name: '细节', minZoom: 5 },
} as const

type MapZoomLevel = keyof typeof MAP_ZOOM_LEVELS

function fromLevel(level: MapZoomLevel, until?: MapZoomLevel): Readonly<MapZoomRange> {
  return Object.freeze({
    minZoom: MAP_ZOOM_LEVELS[level].minZoom,
    maxZoom: until === undefined ? null : MAP_ZOOM_LEVELS[until].minZoom,
  })
}

export const MAP_POINT_ZOOM_RANGES = {
  echo: fromLevel('local'),
  'country-name': fromLevel('world', 'region'),
  'region-name': fromLevel('region', 'detail'),
  'place-name': fromLevel('local'),
  nexus: fromLevel('overview'),
  beacon: fromLevel('surroundings'),
  'tacet-field': fromLevel('surroundings'),
  'training-ground': fromLevel('surroundings'),
  hologram: fromLevel('surroundings'),
  boss: fromLevel('surroundings'),
  domain: fromLevel('surroundings'),
  endgame: fromLevel('surroundings'),
  challenge: fromLevel('surroundings'),
  'local-transit': fromLevel('local'),
  entrance: fromLevel('local'),
  landmark: fromLevel('detail'),
  service: fromLevel('detail'),
  unknown: fromLevel('detail'),
} as const satisfies Record<NavigationKind | 'echo' | 'country-name' | 'region-name' | 'place-name', Readonly<MapZoomRange>>

export function mapZoomForResolution(resolution: number): number {
  return Number.isFinite(resolution) && resolution > 0
    ? Math.log2(MAP_ZOOM_BASE_RESOLUTION / resolution)
    : Number.NaN
}

export function navigationPointZoomRange(point: Pick<NavigationPoint, 'kind'>): Readonly<MapZoomRange> {
  return MAP_POINT_ZOOM_RANGES[point.kind]
}

export function mapPointZoomRange(point: MapDisplayPoint): Readonly<MapZoomRange> {
  switch (point.category) {
    case 'echo': return MAP_POINT_ZOOM_RANGES.echo
    case 'navigation': return navigationPointZoomRange(point.location)
    case 'region-name': return point.location.level === 1 ? MAP_POINT_ZOOM_RANGES['country-name']
      : point.location.level === 2 ? MAP_POINT_ZOOM_RANGES['region-name'] : MAP_POINT_ZOOM_RANGES['place-name']
  }
}

export function isPointVisibleAtZoom(range: Readonly<MapZoomRange>, zoom: number): boolean {
  if (!Number.isFinite(zoom)) return false
  // Stabilize both sides of a shared boundary during fractional zoom animations.
  const roundedZoom = Math.round(zoom * 1e6) / 1e6
  return roundedZoom >= range.minZoom && (range.maxZoom === null || roundedZoom < range.maxZoom)
}

export function isMapPointVisibleAtZoom(point: MapDisplayPoint, zoom: number): boolean {
  return isPointVisibleAtZoom(mapPointZoomRange(point), zoom)
}

export function mapZoomRangeLabel(range: Readonly<MapZoomRange>): string {
  if (range.minZoom === 0 && range.maxZoom === null) return '全景至细节'
  const level = Object.values(MAP_ZOOM_LEVELS).find(({ minZoom }) => minZoom === range.minZoom)
  const until = Object.values(MAP_ZOOM_LEVELS).find(({ minZoom }) => minZoom === range.maxZoom)
  return range.maxZoom === null ? `${level?.name ?? range.minZoom}起显示`
    : `${level?.name ?? range.minZoom}至${until?.name ?? range.maxZoom}前显示`
}
