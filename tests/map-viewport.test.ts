import { describe, expect, it, vi } from 'vitest'
import View from 'ol/View.js'
import Projection from 'ol/proj/Projection.js'
import { useMapViewport } from '../src/map/useMapViewport.ts'
import type { MapStateDefinition } from '../src/domain/types.ts'
import type { MapViewportState } from '../src/url/explorer-url.ts'
import type { MapPadding } from '../src/map/viewport-padding.ts'

const projection = new Projection({ code: 'TEST:MAP', units: 'pixels' })
const state: MapStateDefinition = {
  gravityTiles: [],
  id: 8, name: '地图', tileIds: [], layeredMaps: [],
  tileExtent: { minTileX: 0, minTileY: 0, maxTileX: 9, maxTileY: 9, extent: [0, 0, 10000, 10000] },
}

function setup(savedViewport: MapViewportState | null = null) {
  let saved = savedViewport
  let view = new View({ projection })
  let size = [1000, 800]
  let padding: MapPadding = [16, 16, 16, 16]
  const onViewportChanged = vi.fn((value: MapViewportState | null) => { saved = value })
  const viewport = useMapViewport({
    getMap: () => ({
      getView: () => view,
      getSize: () => size,
      setView: (value) => {
        if (!(value instanceof View)) throw new Error('测试地图需要同步 View')
        view = value
        view.setViewportSize(size)
      },
    }),
    getPadding: () => padding,
    getSavedViewport: () => saved,
    onViewportChanged,
  })
  viewport.configureBaseView(state, projection)
  return {
    viewport, onViewportChanged,
    view: () => view,
    setSize: (value: number[]) => { size = value },
    setPadding: (value: MapPadding) => { padding = value },
  }
}

describe('map viewport coordination', () => {
  it('omits the default view and restores an explicit URL view without floor refitting', () => {
    const initial = setup()
    initial.viewport.publish()
    expect(initial.onViewportChanged).toHaveBeenLastCalledWith(null)
    const saved: MapViewportState = { center: [1200, 1400], zoom: 2 }
    const restored = setup(saved)
    restored.viewport.restoreFloorViewport([2000, 2000, 3000, 3000])
    expect(restored.view().getCenter()).toEqual(saved.center)
    expect(restored.view().getZoom()).toBe(saved.zoom)
    restored.viewport.publish()
    expect(restored.onViewportChanged).toHaveBeenLastCalledWith(saved)
  })

  it('publishes a legacy floor location explicitly so a refresh or resize cannot refit it', () => {
    const app = setup()
    const baseCenter = app.view().getCenter()
    app.viewport.restoreFloorViewport([1000, 1000, 2000, 2000])
    expect(app.view().getCenter()).not.toEqual(baseCenter)
    app.viewport.publish()
    const saved = app.onViewportChanged.mock.lastCall?.[0]
    expect(saved).not.toBeNull()
    app.setSize([500, 800])
    app.viewport.restoreFloorViewport([3000, 3000, 4000, 4000])
    expect(app.view().getCenter()).toEqual(saved?.center)
    expect(setup(saved).view().getCenter()).toEqual(saved?.center)
  })

  it('does not fit a missing or empty floor extent or a zero-sized map', () => {
    const app = setup()
    const fit = vi.spyOn(app.view(), 'fit')
    app.viewport.restoreFloorViewport(null)
    app.viewport.restoreFloorViewport([Infinity, Infinity, -Infinity, -Infinity])
    app.setSize([0, 0])
    app.viewport.restoreFloorViewport([0, 0, 100, 100])
    expect(fit).not.toHaveBeenCalled()
  })

  it.each([0.14, 1.2, 7.5])('locates without changing resolution %s and restores the published viewport', (requestedResolution) => {
    const app = setup()
    app.setPadding([16, 340, 16, 16])
    const view = app.view()
    view.setResolution(requestedResolution)
    const resolution = view.getResolution() ?? 0
    const zoom = view.getZoom()
    expect(app.viewport.locate([4000, 4000])).toBe(true)
    const center = view.getCenter()
    expect(center?.[0]).toBeCloseTo(4000 + 162 * resolution)
    expect(center?.[1]).toBeCloseTo(4000)
    expect(view.getResolution()).toBe(resolution)
    expect(view.getZoom()).toBe(zoom)
    const published = app.onViewportChanged.mock.lastCall?.[0]
    expect(published).not.toBeNull()
    if (!published) throw new Error('定位视口未保存')
    expect(published.zoom).toBe(zoom)
    view.setCenter([6000, 6000])
    app.viewport.locate([4000, 4000])
    expect(view.getCenter()).toEqual(center)
    expect(view.getResolution()).toBe(resolution)
    const restored = setup(published)
    expect(restored.view().getCenter()).toEqual(center)
    expect(restored.view().getZoom()).toBeCloseTo(view.getZoom() ?? 0)
  })

  it('applies a requested resolution for region navigation', () => {
    const app = setup()
    expect(app.viewport.locate([4000, 4000], 2.3)).toBe(true)
    expect(app.view().getResolution()).toBe(2.3)
  })

  it.each<{ name: string, padding: MapPadding }>([
    { name: 'collapsed panels', padding: [16, 16, 16, 16] },
    { name: 'right panel', padding: [16, 352, 16, 16] },
    { name: 'bottom panel', padding: [16, 16, 320, 16] },
  ])('requires more than 25% clearance on every available edge with $name', ({ padding }) => {
    const app = setup()
    app.setPadding(padding)
    app.view().setResolution(2)
    expect(app.viewport.locate([4000, 4000])).toBe(true)
    const [top, right, bottom, left] = padding
    const horizontalLimit = (1000 - left - right) * 0.25 * 2
    const verticalLimit = (800 - top - bottom) * 0.25 * 2
    for (const direction of [-1, 1]) {
      expect(app.viewport.containsCoordinate([4000 + direction * (horizontalLimit - 1), 4000])).toBe(true)
      expect(app.viewport.containsCoordinate([4000 + direction * horizontalLimit, 4000])).toBe(false)
      expect(app.viewport.containsCoordinate([4000 + direction * (horizontalLimit + 1), 4000])).toBe(false)
      expect(app.viewport.containsCoordinate([4000, 4000 + direction * (verticalLimit - 1)])).toBe(true)
      expect(app.viewport.containsCoordinate([4000, 4000 + direction * verticalLimit])).toBe(false)
      expect(app.viewport.containsCoordinate([4000, 4000 + direction * (verticalLimit + 1)])).toBe(false)
    }
  })

  it('accepts only stationary coordinates inside the central map area clear of panels', () => {
    const app = setup()
    app.setPadding([60, 340, 100, 16])
    app.view().setResolution(1.2)
    expect(app.viewport.locate([4000, 4000])).toBe(true)
    expect(app.viewport.containsCoordinate([4000, 4000])).toBe(true)
    const [x = 0, y = 0] = app.view().getCenter() ?? []
    const resolution = app.view().getResolution() ?? 1
    expect(app.viewport.containsCoordinate([x + 400 * resolution, y])).toBe(false)
    expect(app.viewport.containsCoordinate([x, y + 390 * resolution])).toBe(false)
    expect(app.viewport.containsCoordinate([x, y - 350 * resolution])).toBe(false)
    expect(app.viewport.containsCoordinate([NaN, y])).toBe(false)
    const interacting = vi.spyOn(app.view(), 'getInteracting').mockReturnValue(true)
    expect(app.viewport.containsCoordinate([4000, 4000])).toBe(false)
    interacting.mockRestore()
    const animating = vi.spyOn(app.view(), 'getAnimating').mockReturnValue(true)
    expect(app.viewport.containsCoordinate([4000, 4000])).toBe(false)
    animating.mockRestore()
    app.view().setCenter([7000, 7000])
    expect(app.viewport.containsCoordinate([4000, 4000])).toBe(false)
    expect(app.viewport.locate([4000, 4000])).toBe(true)
    expect(app.viewport.locate([-100000, -100000])).toBe(false)
    app.setSize([0, 0])
    expect(app.viewport.containsCoordinate([4000, 4000])).toBe(false)
    expect(app.viewport.locate([4000, 4000])).toBe(false)
  })
})
