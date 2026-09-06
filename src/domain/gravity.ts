import type { GravityType, MapStateDefinition } from './types.ts'

export function hasGravityMap(state: MapStateDefinition | null | undefined): boolean {
  return (state?.gravityTiles.length ?? 0) > 0
}

export function gravityName(gravity: GravityType | null | undefined): string {
  return gravity === 2 ? '反重力' : gravity === 1 ? '普通重力' : '重力待核验'
}

export function matchesGravity(gravity: GravityType | null | undefined, selected: GravityType | null | undefined): boolean {
  if (selected === null || selected === undefined) return true
  // Legacy unmarked points remain discoverable in the ordinary view, but are not route candidates.
  return gravity === selected || (gravity == null && selected === 1)
}
