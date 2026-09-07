import { afterEach, describe, expect, it, vi } from 'vitest'
import Feature from 'ol/Feature.js'
import Event from 'ol/events/Event.js'
import MultiLineString from 'ol/geom/MultiLineString.js'
import Point from 'ol/geom/Point.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import CircleStyle from 'ol/style/Circle.js'
import Icon from 'ol/style/Icon.js'
import Style from 'ol/style/Style.js'
import { createRouteLayer } from '../src/map/route-layer.ts'
import type { RoutePoint } from '../src/domain/types.ts'

afterEach(() => vi.unstubAllGlobals())

function point(id: string, x: number): RoutePoint {
  return { id, name: id, echoId: null, stateId: 8, levelId: null, coordinate: { x, y: 0, z: 0 }, mapCoordinate: [x, 0] }
}

function drawingContext() {
  return {
    canvas: { width: 600, height: 600 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#000',
    lineWidth: 1,
    save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), resetTransform: vi.fn(), clearRect: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), arc: vi.fn(),
    setLineDash: vi.fn(), stroke: vi.fn(), fill: vi.fn(), fillRect: vi.fn(),
  }
}

function render(layer: VectorLayer, context: ReturnType<typeof drawingContext>, scale = 1) {
  layer.dispatchEvent(Object.assign(new Event('postrender'), {
    context,
    inversePixelTransform: [2, 0, 0, 2, 0, 0],
    frameState: {
      size: [300, 300],
      extent: [0, 0, 300, 300],
      viewState: { resolution: 1 / scale },
      coordinateToPixelTransform: [scale, 0, 0, -scale, 0, 200],
    },
  }))
}

describe('route map lines', () => {
  it('uses one color without arrow outlines and applies opacity once after drawing', () => {
    const routeLayer = createRouteLayer()
    const context = drawingContext()
    const strokes: { color: string; width: number; alpha: number; composite: string }[] = []
    const opacityPasses: { alpha: number; composite: string }[] = []
    context.stroke.mockImplementation(() => strokes.push({ color: context.strokeStyle, width: context.lineWidth, alpha: context.globalAlpha, composite: context.globalCompositeOperation }))
    context.fillRect.mockImplementation(() => opacityPasses.push({ alpha: context.globalAlpha, composite: context.globalCompositeOperation }))
    try {
      routeLayer.update({ points: [point('first', 0), point('second', 200)], totalCost: 200, startPointId: null, algorithm: 'exact' })
      render(routeLayer.layer, context)
      expect(strokes).toEqual([
        { color: '#65f1c2', width: 3, alpha: 1, composite: 'source-over' },
        { color: '#65f1c2', width: 3, alpha: 1, composite: 'source-over' },
      ])
      expect(opacityPasses).toEqual([{ alpha: 0.6, composite: 'destination-in' }])
      expect(context.resetTransform).toHaveBeenCalledOnce()
      expect(context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 600, 600)
      expect(context.fillRect.mock.invocationCallOrder[0]).toBeGreaterThan(context.stroke.mock.invocationCallOrder.at(-1) ?? 0)
    } finally { routeLayer.dispose() }
  })

  it('starts a new walking segment at each teleport without connecting distant echoes', () => {
    const routeLayer = createRouteLayer()
    try {
      routeLayer.update({
        points: [
          { ...point('first', 1), teleportFrom: point('west-beacon', 0) },
          point('second', 2),
          { ...point('third', 101), teleportFrom: point('east-beacon', 100) },
          point('fourth', 102),
        ],
        totalCost: 4,
        startPointId: 'west-beacon',
        algorithm: 'exact',
      })
      const geometries = routeLayer.layer.getSource()?.getFeatures().map((feature) => feature.getGeometry()) ?? []
      const line = geometries.find((geometry) => geometry instanceof MultiLineString)
      expect(line?.getCoordinates()).toEqual([
        [[0, 0], [1, 0], [2, 0]],
        [[100, 0], [101, 0], [102, 0]],
      ])
      expect(geometries.filter((geometry) => geometry instanceof Point)).toHaveLength(0)
      expect(geometries).toHaveLength(1)

      routeLayer.update(null)
      expect(routeLayer.layer.getSource()?.getFeatures()).toEqual([])
    } finally {
      routeLayer.dispose()
    }
  })

  it('starts at an explicit teleport arrival instead of clipping against the nearby map icon', () => {
    const source = new VectorSource({ features: [new Feature({
      geometry: new Point([100, 0]), mapPoint: { category: 'navigation', location: { id: 'beacon', kind: 'beacon', iconUrl: '' } },
    })] })
    const iconLayer = new VectorLayer({ source, style: new Style({ image: new CircleStyle({ radius: 20 }) }) })
    const routeLayer = createRouteLayer([iconLayer])
    const context = drawingContext()
    try {
      routeLayer.update({
        points: [{ ...point('target', 200), teleportFrom: { ...point('beacon', 120), isTeleportArrival: true } }],
        totalCost: 80, startPointId: 'beacon', algorithm: 'exact',
      })
      render(routeLayer.layer, context)
      expect(context.moveTo.mock.calls[0]).toEqual([120, 200])
      expect(context.arc).toHaveBeenCalledWith(120, 200, 5, 0, Math.PI * 2)
    } finally {
      routeLayer.dispose()
      iconLayer.dispose()
      source.dispose()
    }
  })

  it('draws an uninterrupted route when every leg is walked', () => {
    const routeLayer = createRouteLayer()
    try {
      routeLayer.update({ points: [point('first', 1), point('second', 2)], totalCost: 1, startPointId: null, algorithm: 'exact' })
      const line = routeLayer.layer.getSource()?.getFeatures().map((feature) => feature.getGeometry()).find((geometry) => geometry instanceof MultiLineString)
      expect(line?.getCoordinates()).toEqual([[[1, 0], [2, 0]]])
    } finally {
      routeLayer.dispose()
    }
  })

  it('preserves the extent of a single target without creating a numbered marker', () => {
    const routeLayer = createRouteLayer()
    try {
      routeLayer.update({ points: [point('only', 12)], totalCost: 0, startPointId: null, algorithm: 'exact' })
      expect(routeLayer.getExtent()).toEqual([12, 0, 12, 0])
      expect(routeLayer.layer.getSource()?.getFeatures()).toEqual([])
    } finally {
      routeLayer.dispose()
    }
  })

  it.each([
    { name: 'right', from: [20, 100], to: [220, 100] },
    { name: 'left', from: [220, 100], to: [20, 100] },
    { name: 'up', from: [100, 20], to: [100, 220] },
    { name: 'diagonal', from: [20, 20], to: [220, 220] },
  ] satisfies { name: string; from: [number, number]; to: [number, number] }[])('points the arrows $name along the walking direction', ({ from, to }) => {
    const routeLayer = createRouteLayer()
    const context = drawingContext()
    try {
      routeLayer.update({ points: [{ ...point('first', 0), mapCoordinate: from }, { ...point('second', 0), mapCoordinate: to }], totalCost: 100, startPointId: null, algorithm: 'exact' })
      render(routeLayer.layer, context)
      const length = Math.hypot(to[0] - from[0], to[1] - from[1])
      const dx = (to[0] - from[0]) / length
      const dy = -(to[1] - from[1]) / length
      const arrowTails = context.moveTo.mock.calls.slice(1)
      expect(arrowTails.length).toBeGreaterThan(0)
      for (const [index, tail] of arrowTails.entries()) {
        const tip = context.lineTo.mock.calls[index * 2 + 1]
        const otherTail = context.lineTo.mock.calls[index * 2 + 2]
        if (!tip || !otherTail) throw new Error('方向箭头缺少顶点')
        const tailX = (tail[0] + otherTail[0]) / 2
        const tailY = (tail[1] + otherTail[1]) / 2
        expect((tip[0] - tailX) * dx + (tip[1] - tailY) * dy).toBeCloseTo(9)
        expect((tip[0] - tailX) * dy - (tip[1] - tailY) * dx).toBeCloseTo(0)
        expect(Math.hypot(tail[0] - otherTail[0], tail[1] - otherTail[1])).toBeCloseTo(10)
      }
      expect(context.setLineDash).toHaveBeenLastCalledWith([])
    } finally {
      routeLayer.dispose()
    }
  })

  it('caps arrow size at close zooms and omits arrows on tiny or offscreen legs', () => {
    const routeLayer = createRouteLayer()
    try {
      routeLayer.update({ points: [point('first', 0), point('second', 100)], totalCost: 100, startPointId: null, algorithm: 'exact' })
      for (const scale of [1, 2]) {
        const context = drawingContext()
        render(routeLayer.layer, context, scale)
        const tail = context.moveTo.mock.calls[1]
        const tip = context.lineTo.mock.calls[1]
        if (!tail || !tip) throw new Error('路线没有方向箭头')
        expect(tip[0] - tail[0]).toBeCloseTo(9)
        expect(Math.abs(tip[1] - tail[1])).toBeCloseTo(5)
      }
      for (const [from, to] of [[0, 10], [10_000, 20_000]]) {
        if (from === undefined || to === undefined) throw new Error('测试坐标缺失')
        routeLayer.update({ points: [point('first', from), point('second', to)], totalCost: to - from, startPointId: null, algorithm: 'exact' })
        const context = drawingContext()
        render(routeLayer.layer, context)
        expect(context.moveTo).toHaveBeenCalledOnce()
        expect(context.lineTo).toHaveBeenCalledOnce()
      }
    } finally {
      routeLayer.dispose()
    }
  })

  it('shrinks strokes, dashes and arrows together at overview zooms with a readable lower bound', () => {
    const routeLayer = createRouteLayer()
    try {
      routeLayer.update({ points: [point('first', 0), point('second', 4000)], totalCost: 4000, startPointId: null, algorithm: 'exact' })
      const sizes = [2, 1, 0.5, 0.25, 0.0625, 0.01].map((scale) => {
        const context = drawingContext()
        const strokes: number[] = []
        context.stroke.mockImplementation(() => { strokes.push(context.lineWidth) })
        render(routeLayer.layer, context, scale)
        const tail = context.moveTo.mock.calls[1], tip = context.lineTo.mock.calls[1]
        if (!tail || !tip) throw new Error('路线没有方向箭头')
        return { width: strokes[0] ?? 0, arrowWidth: strokes[1] ?? 0, dash: context.setLineDash.mock.calls[0]?.[0]?.[0] ?? 0, arrow: tip[0] - tail[0] }
      })
      expect(sizes[0]).toEqual(sizes[1])
      for (const key of ['width', 'arrowWidth', 'dash', 'arrow'] as const) {
        expect(sizes.at(-1)?.[key]).toBeCloseTo(sizes.at(-2)?.[key] ?? 0)
      }
      for (const index of [2, 3]) {
        expect(sizes[index]?.width).toBeLessThan(sizes[index - 1]?.width ?? 0)
        expect(sizes[index]?.dash).toBeLessThan(sizes[index - 1]?.dash ?? 0)
        expect(sizes[index]?.arrow).toBeLessThan(sizes[index - 1]?.arrow ?? 0)
      }
      for (const size of sizes) {
        expect(size.width).toBeGreaterThanOrEqual(1)
        expect(size.arrow / size.width).toBeCloseTo(3)
        expect(size.arrowWidth).toBeCloseTo(size.width)
      }
    } finally { routeLayer.dispose() }
  })

  it('clears visible icon bounds with a fixed pixel gap at different zooms', () => {
    const source = new VectorSource({ features: [new Feature(new Point([50, 100]))] })
    const iconLayer = new VectorLayer({
      source,
      style: new Style({ image: new CircleStyle({ radius: 10, scale: [2, 1] }) }),
    })
    const routeLayer = createRouteLayer([iconLayer])
    const context = drawingContext()
    try {
      routeLayer.update({ points: [point('first', 0), point('second', 200)], totalCost: 200, startPointId: null, algorithm: 'exact' })
      expect(routeLayer.layer.getClassName()).not.toBe(iconLayer.getClassName())
      const strokeAlphas: number[] = [], maskAlphas: number[] = []
      context.stroke.mockImplementation(() => { strokeAlphas.push(context.globalAlpha) })
      context.fill.mockImplementation(() => { maskAlphas.push(context.globalAlpha) })
      render(routeLayer.layer, context, 1)
      expect(strokeAlphas.every((alpha) => alpha === 1)).toBe(true)
      expect(maskAlphas).toEqual([1])
      expect(context.fillRect.mock.invocationCallOrder[0]).toBeGreaterThan(context.fill.mock.invocationCallOrder[0] ?? 0)
      expect(context.moveTo).toHaveBeenLastCalledWith(30, 90)
      expect(context.lineTo.mock.calls.slice(-3)).toEqual([[70, 90], [70, 110], [30, 110]])
      expect(context).toHaveProperty('lineWidth', 8)
      render(routeLayer.layer, context, 2)
      expect(context.moveTo).toHaveBeenLastCalledWith(80, -10)
      expect(context.lineTo.mock.calls.slice(-3)).toEqual([[120, -10], [120, 10], [80, 10]])
      expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0)
      expect(context.restore).toHaveBeenCalledTimes(2)

      iconLayer.setVisible(false)
      render(routeLayer.layer, context, 1)
      expect(context.fill).toHaveBeenCalledTimes(2)
    } finally {
      routeLayer.dispose()
      iconLayer.dispose()
      source.dispose()
    }
  })

  it.each([
    { name: 'horizontal', target: [150, 100], startCorner: [72, 100], endCorner: [128, 100] },
    { name: 'vertical', target: [50, 200], startCorner: [50, 78], endCorner: [50, 22] },
    { name: 'diagonal', target: [150, 150], startCorner: [72, 100], endCorner: [128, 50] },
  ] satisfies { name: string; target: [number, number]; startCorner: [number, number]; endCorner: [number, number] }[])('connects the closest diamond corners for a $name leg with a clear gap', ({ target, startCorner, endCorner }) => {
    const from: RoutePoint = { ...point('first', 50), mapCoordinate: [50, 100] }
    const to: RoutePoint = { ...point('second', 150), mapCoordinate: target }
    const source = new VectorSource({ features: [from, to].map((point) => new Feature({
      geometry: new Point(point.mapCoordinate), locations: [{ id: point.id }],
    })) })
    // A 46px image contains the existing 44px diamond plus its transparent border.
    const iconLayer = new VectorLayer({ source, style: new Style({ image: new CircleStyle({ radius: 23 }) }) })
    const routeLayer = createRouteLayer([iconLayer])
    const context = drawingContext()
    try {
      routeLayer.update({ points: [from, to], totalCost: 100, startPointId: null, algorithm: 'exact' })
      render(routeLayer.layer, context)
      const dx = endCorner[0] - startCorner[0]
      const dy = endCorner[1] - startCorner[1]
      const length = Math.hypot(dx, dy)
      expect(context.moveTo.mock.calls[0]?.[0]).toBeCloseTo(startCorner[0] + dx / length * 5.5)
      expect(context.moveTo.mock.calls[0]?.[1]).toBeCloseTo(startCorner[1] + dy / length * 5.5)
      expect(context.lineTo.mock.calls[0]?.[0]).toBeCloseTo(endCorner[0] - dx / length * 5.5)
      expect(context.lineTo.mock.calls[0]?.[1]).toBeCloseTo(endCorner[1] - dy / length * 5.5)
      expect(context.fill).toHaveBeenCalledTimes(2)
      expect(context.closePath).toHaveBeenCalledTimes(2)
      expect(context.clearRect).not.toHaveBeenCalled()
      expect(routeLayer.layer.getStyle()).toBeNull()
    } finally {
      routeLayer.dispose()
      iconLayer.dispose()
      source.dispose()
    }
  })

  it('connects to the displayed cluster and omits legs inside the same cluster', () => {
    const source = new VectorSource({ features: [new Feature({
      geometry: new Point([100, 100]), locations: [{ id: 'first' }, { id: 'second' }],
    })] })
    const iconLayer = new VectorLayer({ source, style: new Style({ image: new CircleStyle({ radius: 23 }) }) })
    const routeLayer = createRouteLayer([iconLayer])
    const context = drawingContext()
    try {
      routeLayer.update({
        points: [{ ...point('first', 80), teleportFrom: point('beacon', 100) }, point('second', 120)],
        totalCost: 100, startPointId: 'beacon', algorithm: 'exact',
      })
      render(routeLayer.layer, context)
      expect(context.moveTo.mock.calls[0]).toEqual([100, 200])
      expect(context.lineTo.mock.calls[0]).toEqual([100, 127.5])
      expect(context.stroke).toHaveBeenCalledTimes(3)
    } finally {
      routeLayer.dispose()
      iconLayer.dispose()
      source.dispose()
    }
  })

  it.each([false, true])('connects ordinary icons at their alpha outline, with read failure fallback: %s', (unreadable) => {
    class LoadedImage {
      width = 8
      height = 8
      complete = true
      src = `route-outline-${unreadable}`
    }
    vi.stubGlobal('Image', LoadedImage)
    const data = new Uint8ClampedArray(8 * 8 * 4)
    for (let y = 1; y < 7; y += 1) for (let x = 3; x < 5; x += 1) data[(y * 8 + x) * 4 + 3] = 255
    const getImageData = vi.fn(() => {
      if (unreadable) throw new DOMException('Blocked pixels', 'SecurityError')
      return { width: 8, height: 8, data }
    })
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ drawImage: vi.fn(), getImageData }) }) })
    const source = new VectorSource({ features: [new Feature({
      geometry: new Point([100, 0]), mapPoint: { category: 'navigation', location: { id: 'beacon', kind: 'beacon', iconUrl: 'test.png' } },
    })] })
    const iconLayer = new VectorLayer({ source, style: new Style({ image: new Icon({ img: new Image(), scale: 4, opacity: 0.48 }) }) })
    const routeLayer = createRouteLayer([iconLayer])
    try {
      routeLayer.update({ points: [{ ...point('target', 200), teleportFrom: point('beacon', 100) }], totalCost: 100, startPointId: 'beacon', algorithm: 'exact' })
      for (const scale of [1, 2]) {
        const context = drawingContext()
        render(routeLayer.layer, context, scale)
        expect(context.moveTo.mock.calls[0]).toEqual([100 * scale + (unreadable ? 16 : 4) + 5.5, 200])
        expect(context.lineTo.mock.calls[0]).toEqual([200 * scale, 200])
        expect(context.fill).toHaveBeenCalledOnce()
      }
      expect(getImageData).toHaveBeenCalledOnce()
    } finally {
      routeLayer.dispose()
      iconLayer.dispose()
      source.dispose()
    }
  })

  it.each([
    { typeName: '无归的谬误', expected: [100 + 22 + 5.5, 200], vertices: 4 },
    { typeName: '星海迷途之扉', expected: [100 + 22 + 5.5, 200], vertices: 8 },
  ])('uses the rendered boss border for $typeName', ({ typeName, expected, vertices }) => {
    const source = new VectorSource({ features: [new Feature({
      geometry: new Point([100, 0]), mapPoint: { category: 'navigation', location: { id: 'boss', kind: 'boss', typeName, iconUrl: 'boss.png' } },
    })] })
    const iconLayer = new VectorLayer({ source, style: new Style({ image: new CircleStyle({ radius: 23 }) }) })
    const routeLayer = createRouteLayer([iconLayer])
    const context = drawingContext()
    try {
      routeLayer.update({ points: [{ ...point('target', 200), teleportFrom: point('boss', 100) }], totalCost: 100, startPointId: 'boss', algorithm: 'exact' })
      render(routeLayer.layer, context)
      expect(context.moveTo.mock.calls[0]).toEqual(expected)
      expect(context.lineTo).toHaveBeenCalledTimes(vertices + 2)
    } finally {
      routeLayer.dispose()
      iconLayer.dispose()
      source.dispose()
    }
  })
})
