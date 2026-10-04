import type { MapDisplayPoint, MapDisplayTier, MapZoomRange, NavigationPoint } from '../domain/types.ts'
import { navigationPointDisplayTier } from '../domain/navigation-point-types.ts'
import { MAP_DISPLAY_TIERS } from '../domain/map-display-tier.ts'
import { OFFICIAL_SCALE_BASE, TILE_WIDTH } from './projection.ts'

// Approximate the measured 35 wheel steps using a fixed reference canvas.
// Actual canvas size and the base map's OpenLayers/URL zoom do not affect visibility.
export const MAP_ZOOM_CALIBRATION = {
  referenceWidth: 1024,
  farGameSpan: 3400,
  nearGameSpan: 1000,
  steps: 35,
} as const
const baseResolution = MAP_ZOOM_CALIBRATION.farGameSpan * TILE_WIDTH / OFFICIAL_SCALE_BASE / MAP_ZOOM_CALIBRATION.referenceWidth
const scaleRatio = MAP_ZOOM_CALIBRATION.farGameSpan / MAP_ZOOM_CALIBRATION.nearGameSpan

function tierRange(tier: MapDisplayTier): Readonly<MapZoomRange> {
  return Object.freeze({ minZoom: MAP_DISPLAY_TIERS[tier].minZoom, maxZoom: null })
}

export const MAP_TIER_ZOOM_RANGES = {
  always: tierRange('always'),
  far: tierRange('far'),
  near: tierRange('near'),
}

export const MAP_POINT_ZOOM_RANGES = {
  echo: MAP_TIER_ZOOM_RANGES.far,
  'region-name': Object.freeze({ minZoom: 0, maxZoom: MAP_DISPLAY_TIERS.far.minZoom }),
  'place-name': MAP_TIER_ZOOM_RANGES.far,
}

export function mapZoomForResolution(resolution: number): number {
  if (!Number.isFinite(resolution) || resolution <= 0) return Number.NaN
  // Further zooming out keeps always-visible icons and district names visible.
  return Math.max(0, MAP_ZOOM_CALIBRATION.steps * Math.log(baseResolution / resolution) / Math.log(scaleRatio))
}

export function mapResolutionForZoom(zoom: number): number {
  return Number.isFinite(zoom) && zoom >= 0
    ? baseResolution / scaleRatio ** (zoom / MAP_ZOOM_CALIBRATION.steps)
    : Number.NaN
}

export function navigationPointZoomRange(point: Pick<NavigationPoint, 'kind' | 'pointType' | 'displayTier'>): Readonly<MapZoomRange> {
  return MAP_TIER_ZOOM_RANGES[navigationPointDisplayTier(point)]
}

export function mapPointZoomRange(point: MapDisplayPoint): Readonly<MapZoomRange> | null {
  switch (point.category) {
    case 'echo': return MAP_POINT_ZOOM_RANGES.echo
    case 'navigation': return navigationPointZoomRange(point.location)
    case 'region-name': return point.location.level === 2 ? MAP_POINT_ZOOM_RANGES['region-name']
      : point.location.level === 3 ? MAP_POINT_ZOOM_RANGES['place-name'] : null
  }
}

export function isPointVisibleAtZoom(range: Readonly<MapZoomRange> | null, zoom: number): boolean {
  if (!range || !Number.isFinite(zoom)) return false
  // Stabilize both sides of a shared boundary during fractional zoom animations.
  const roundedZoom = Math.round(zoom * 1e6) / 1e6
  return roundedZoom >= range.minZoom && (range.maxZoom === null || roundedZoom < range.maxZoom)
}

export function isMapPointVisibleAtZoom(point: MapDisplayPoint, zoom: number): boolean {
  return isPointVisibleAtZoom(mapPointZoomRange(point), zoom)
}

export function mapZoomRangeLabel(range: Readonly<MapZoomRange> | null): string {
  if (!range) return '仅用于地图导航'
  const tier = Object.values(MAP_DISPLAY_TIERS).find(({ minZoom }) => minZoom === range.minZoom)
  return range.maxZoom === null ? tier?.name ?? `第 ${range.minZoom} 格起显示`
    : `第 ${range.minZoom} 至 ${range.maxZoom} 格前显示`
}
