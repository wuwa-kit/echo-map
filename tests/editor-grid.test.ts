import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FrameState } from 'ol/Map.js'
import { createEditorGridLayer, gridCoordinates } from '../src/map/editor-grid.ts'
import { gameToMapCoordinate } from '../src/map/projection.ts'

describe('editor coordinate grid', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('isolates its canvas so later OpenLayers layers cannot reuse its drawing context', () => {
    const context = {
      setTransform: vi.fn(), clearRect: vi.fn(), setLineDash: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    }
    const canvas = { className: '', style: {}, width: 0, height: 0, getContext: () => context }
    const container = { className: '', appendChild: vi.fn() }
    vi.stubGlobal('document', { createElement: (tag: string) => tag === 'canvas' ? canvas : container })
    const layer = createEditorGridLayer()
    const frame = {
      size: [400, 400], pixelRatio: 2, extent: [850, 0, 1250, 400],
      coordinateToPixelTransform: [1, 0, 0, -1, -850, 400],
    } as FrameState
    expect(layer.render(frame, document.createElement('div'))).toBe(container)
    expect(container.appendChild).toHaveBeenCalledWith(canvas)
    expect(container.className).toContain('absolute')
    expect(container.className).not.toBe('ol-layer')
    expect(canvas.width).toBe(800)
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0)
    expect(context.moveTo).toHaveBeenCalledTimes(6)
    expect(context.setLineDash).toHaveBeenCalledWith([5, 5])
    layer.dispose()
  })

  it('keeps 200-unit spacing aligned to game coordinates across tile boundaries', () => {
    const [origin] = gameToMapCoordinate(0, 0)
    expect(gridCoordinates(0, 1700, origin)).toEqual([50, 250, 450, 650, 850, 1050, 1250, 1450, 1650])
    expect(gridCoordinates(-450, 450)).toEqual([-400, -200, 0, 200, 400])
  })
  it('handles small and invalid viewports', () => {
    expect(gridCoordinates(1, 199)).toEqual([])
    expect(gridCoordinates(200, 200)).toEqual([200])
    expect(gridCoordinates(NaN, 200)).toEqual([])
    expect(gridCoordinates(200, 0)).toEqual([])
  })
})
