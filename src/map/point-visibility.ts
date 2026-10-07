import type { MapDisplayPoint, MapDisplayPolicy, NavigationPoint } from '../domain/types.ts'
import { navigationPointDisplayTier } from '../domain/navigation-point-types.ts'
import { MAP_DISPLAY_TIERS } from '../domain/map-display-tier.ts'

export const MAP_POINT_DISPLAY_POLICIES = {
  echo: MAP_DISPLAY_TIERS.teleport.policy,
  'region-name': { kind: 'overview', minGameUnitsPerPixel: 2.5 },
  'place-name': { kind: 'detail', maxGameUnitsPerPixel: 2.5 },
} as const satisfies Record<string, MapDisplayPolicy>

export function navigationPointDisplayPolicy(point: Pick<NavigationPoint, 'pointType' | 'mode'>): MapDisplayPolicy {
  return MAP_DISPLAY_TIERS[navigationPointDisplayTier(point)].policy
}

export function mapPointDisplayPolicy(point: MapDisplayPoint): MapDisplayPolicy | null {
  switch (point.category) {
    case 'echo': return MAP_POINT_DISPLAY_POLICIES.echo
    case 'navigation': return navigationPointDisplayPolicy(point.location)
    case 'region-name': return point.location.level === 2 ? MAP_POINT_DISPLAY_POLICIES['region-name']
      : point.location.level === 3 ? MAP_POINT_DISPLAY_POLICIES['place-name'] : null
  }
}

export function isPointVisibleAtScale(policy: MapDisplayPolicy | null, gameUnitsPerPixel: number): boolean {
  if (!policy || !Number.isFinite(gameUnitsPerPixel) || gameUnitsPerPixel <= 0) return false
  if (policy.kind === 'always') return true
  // Keep both sides of a shared boundary stable through floating-point conversions.
  const boundary = policy.kind === 'detail' ? policy.maxGameUnitsPerPixel : policy.minGameUnitsPerPixel
  const atBoundary = Math.abs(gameUnitsPerPixel - boundary) <= boundary * 1e-10
  return policy.kind === 'detail'
    ? atBoundary || gameUnitsPerPixel < boundary
    : !atBoundary && gameUnitsPerPixel > boundary
}

export function isMapPointVisibleAtScale(point: MapDisplayPoint, gameUnitsPerPixel: number): boolean {
  return isPointVisibleAtScale(mapPointDisplayPolicy(point), gameUnitsPerPixel)
}
