import type { EchoLocation, NavigationPoint } from '../domain/types.ts'

const NAVIGATION_MIN_ZOOM: Record<NavigationPoint['kind'], number> = {
  nexus: 0,
  beacon: 1.75,
  'tacet-field': 2.6,
  'training-ground': 2.6,
  hologram: 2.6,
  boss: 2.6,
  domain: 2.6,
  endgame: 2.6,
  challenge: 2.6,
  'local-transit': 3.2,
  entrance: 3.35,
  landmark: 4.15,
  service: 4.15,
  unknown: 4.5,
}

export function navigationPointMinZoom(point: Pick<NavigationPoint, 'kind'>): number {
  return NAVIGATION_MIN_ZOOM[point.kind]
}

export function echoLocationMinZoom(location: Pick<EchoLocation, 'gameCoordinate'>): number {
  return location.gameCoordinate === null ? 4 : 2.8
}

export function isPointVisibleAtZoom(minZoom: number, zoom: number): boolean {
  return Number.isFinite(zoom) && zoom + 1e-6 >= minZoom
}
