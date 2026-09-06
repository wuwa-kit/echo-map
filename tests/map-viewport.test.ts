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

  it('refits a route for panel changes until a deliberate map movement', () => {
    const app = setup()
    const extent = [1000, 1000, 4000, 3000]
    app.viewport.fitRoute(extent)
    const initialCenter = app.view().getCenter()
    app.setPadding([16, 340, 16, 16])
    app.viewport.fitRoute(extent)
    expect(app.view().getCenter()).not.toEqual(initialCenter)
    app.view().setCenter([7000, 7000])
    app.setPadding([16, 16, 16, 16])
    app.viewport.fitRoute(extent)
    expect(app.view().getCenter()).toEqual([7000, 7000])
    app.viewport.resetRoute()
    app.viewport.fitRoute(extent)
    expect(app.view().getCenter()).toEqual(initialCenter)
  })

  it('does not fit missing or empty geometry or a floor in a zero-sized map', () => {
    const app = setup()
    const fit = vi.spyOn(app.view(), 'fit')
    app.viewport.fitRoute(null)
    app.viewport.fitRoute([Infinity, Infinity, -Infinity, -Infinity])
    app.viewport.restoreFloorViewport(null)
    app.setSize([0, 0])
    app.viewport.restoreFloorViewport([0, 0, 100, 100])
    expect(fit).not.toHaveBeenCalled()
  })

  it('locates a destination in the unobscured map area, repeats after panning and restores from its published viewport', () => {
    const app = setup()
    app.setPadding([16, 340, 16, 16])
    app.viewport.locate([4000, 4000])
    const view = app.view()
    const center = view.getCenter()
    expect(center?.[0]).toBeCloseTo(4000 + 162 * 2.3)
    expect(center?.[1]).toBeCloseTo(4000)
    expect(view.getResolution()).toBeCloseTo(2.3)
    const published = app.onViewportChanged.mock.lastCall?.[0]
    expect(published).not.toBeNull()
    if (!published) throw new Error('定位视口未保存')
    view.setCenter([6000, 6000])
    app.viewport.locate([4000, 4000])
    expect(view.getCenter()).toEqual(center)
    const restored = setup(published)
    expect(restored.view().getCenter()).toEqual(center)
    expect(restored.view().getZoom()).toBeCloseTo(view.getZoom() ?? 0)
  })
})
