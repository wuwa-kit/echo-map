import { describe, expect, it } from 'vitest'
import { echoLocationMinZoom, isPointVisibleAtZoom, navigationPointMinZoom } from '../src/map/point-visibility.ts'

describe('map point zoom visibility', () => {
  it('reveals navigation kinds from overview to local detail', () => {
    expect(navigationPointMinZoom({ kind: 'nexus' })).toBe(0)
    expect(navigationPointMinZoom({ kind: 'beacon' })).toBeLessThan(navigationPointMinZoom({ kind: 'domain' }))
    expect(navigationPointMinZoom({ kind: 'boss' })).toBe(navigationPointMinZoom({ kind: 'domain' }))
    expect(navigationPointMinZoom({ kind: 'challenge' })).toBe(navigationPointMinZoom({ kind: 'domain' }))
    expect(navigationPointMinZoom({ kind: 'domain' })).toBeLessThan(navigationPointMinZoom({ kind: 'service' }))
    expect(isPointVisibleAtZoom(navigationPointMinZoom({ kind: 'beacon' }), 1.74)).toBe(false)
    expect(isPointVisibleAtZoom(navigationPointMinZoom({ kind: 'beacon' }), 1.75)).toBe(true)
  })

  it('reveals verified echo locations before provisional locations', () => {
    const verifiedZoom = echoLocationMinZoom({ gameCoordinate: { x: 1, y: 2, z: 3 } })
    const provisionalZoom = echoLocationMinZoom({ gameCoordinate: null })

    expect(verifiedZoom).toBeLessThan(provisionalZoom)
    expect(isPointVisibleAtZoom(provisionalZoom, verifiedZoom)).toBe(false)
    expect(isPointVisibleAtZoom(provisionalZoom, provisionalZoom)).toBe(true)
  })
})
