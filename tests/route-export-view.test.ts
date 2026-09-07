import { describe, expect, it } from 'vitest'
import Projection from 'ol/proj/Projection.js'
import TileLayer from 'ol/layer/Tile.js'
import { inView } from 'ol/layer/Layer.js'
import { createRouteExportView } from '../src/map/route-export.ts'

describe('independent route export view', () => {
  it.each([0.75, 1.6, 3])('keeps pixel projection layers visible at resolution %s', (resolution) => {
    const projection = new Projection({ code: 'EXPORT:TEST', units: 'pixels' })
    const view = createRouteExportView(projection, [-8460, 566], resolution)
    view.setViewportSize([188, 148])
    expect(view.getResolution()).toBe(resolution)
    expect(Number.isFinite(view.getZoom())).toBe(true)
    expect(view.getCenter()).toEqual([-8460, 566])
    expect(inView(new TileLayer().getLayerState(), view.getState())).toBe(true)
  })
})
