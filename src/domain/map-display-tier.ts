import type { MapDisplayTier, NavigationKind } from './types.ts'

export const MAP_DISPLAY_TIERS = {
  always: { name: '常驻', minZoom: 0 },
  far: { name: '远景', minZoom: 9 },
  near: { name: '近景', minZoom: 16 },
} as const

export const NAVIGATION_KIND_DISPLAY_TIERS = {
  nexus: 'always',
  beacon: 'far',
  'tacet-field': 'far',
  'training-ground': 'far',
  hologram: 'always',
  boss: 'always',
  domain: 'far',
  endgame: 'always',
  challenge: 'near',
  'local-transit': 'near',
  entrance: 'near',
  landmark: 'near',
  service: 'near',
  unknown: 'near',
} as const satisfies Record<NavigationKind, MapDisplayTier>
