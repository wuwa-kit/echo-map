import type { MapDisplayPolicy, MapDisplayTier } from './types.ts'

export const MAP_DISPLAY_TIERS = {
  always: { name: '常驻', policy: { kind: 'always' } },
  teleport: { name: '可传送点', policy: { kind: 'detail', maxGameUnitsPerPixel: 4 } },
  nonTeleport: { name: '不可传送点', policy: { kind: 'detail', maxGameUnitsPerPixel: 2 } },
} as const satisfies Record<MapDisplayTier, { name: string, policy: MapDisplayPolicy }>
