import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import { libraryLocations } from '../src/domain/point-library.ts'
import { createEchoMarkerStyles } from '../src/map/echo-marker.ts'
import { createPointLayers } from '../src/map/point-layers.ts'
import { createPortraitMarkerStyles, PORTRAIT_MARKER_SIZES } from '../src/map/boss-marker.ts'
import { referenceDataset, smallEcho, eliteEcho, mixedPoint } from './fixtures/point-library.ts'

class MarkerPath {
  vertices: number[][] = []
  moveTo(x: number, y: number) { this.vertices.push([x, y]) }
  lineTo(x: number, y: number) { this.vertices.push([x, y]) }
  closePath() {}
}

class PortraitImage {
  complete = false
  naturalWidth = 0
  naturalHeight = 0
  src = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() { portraits.push(this) }
  removeAttribute() {}
}

const painted: (MarkerPath | undefined)[][] = []
const portraits: PortraitImage[] = []
const drawImage = vi.fn()
const fillText = vi.fn()
beforeEach(() => {
  painted.length = 0
  portraits.length = 0
  drawImage.mockClear()
  fillText.mockClear()
  vi.stubGlobal('window', { devicePixelRatio: 2 })
  vi.stubGlobal('Path2D', MarkerPath)
  vi.stubGlobal('Image', PortraitImage)
  vi.stubGlobal('HTMLImageElement', PortraitImage)
  vi.stubGlobal('document', { createElement: () => {
    const paths: (MarkerPath | undefined)[] = []
    painted.push(paths)
    const context = {
      clearRect() {}, scale() {}, setTransform() {}, beginPath() {}, roundRect() {}, stroke() {},
      save() {}, restore() {}, clip() {}, drawImage, fillText,
      fill(path?: MarkerPath) { paths.push(path) },
    }
    return { width: 0, height: 0, getContext: () => context }
  } })
})
afterEach(() => vi.unstubAllGlobals())

describe('echo marker appearance', () => {
  it.each([smallEcho, eliteEcho])('keeps the original C$cost diamond and size after conversion to members', (echo) => {
    const original = createPortraitMarkerStyles(() => {})
    const grouped = createEchoMarkerStyles(() => {})
    const oldStyle = original.getStyle({ shape: 'diamond', size: PORTRAIT_MARKER_SIZES[echo.cost], iconUrl: echo.iconUrl, opacity: 1 })
    const current = grouped.get([{ echoId: echo.id, count: 1 }], referenceDataset.echoes)
    expect(current.styles).toHaveLength(1)
    expect(current.styles[0]?.getText()).toBeNull()
    expect(current.styles[0]?.getImage()?.getScale()).toEqual(oldStyle?.[0]?.getImage()?.getScale())
    expect(painted[0]).toHaveLength(3)
    expect(painted[1]).toEqual(painted[0])
    original.dispose()
    grouped.dispose()
  })

  it('keeps a four-vertex diamond around mixed C1/C3 compositions', () => {
    const grouped = createEchoMarkerStyles(() => {})
    grouped.get([{ echoId: smallEcho.id, count: 3 }, { echoId: eliteEcho.id, count: 1 }], referenceDataset.echoes)
    expect(painted[0]?.[0]?.vertices).toEqual([[23, 1], [45, 23], [23, 45], [1, 23]])
    expect(fillText).not.toHaveBeenCalled()
    grouped.dispose()
  })

  it('defaults to four portraits without quantity, overflow or fallback text on the map', () => {
    const grouped = createEchoMarkerStyles(() => {})
    const members = referenceDataset.echoes.slice(0, 6).map(({ id }) => ({ echoId: id, count: 1 }))
    const entry = grouped.get(members, referenceDataset.echoes)
    expect(portraits).toHaveLength(4)
    for (const portrait of portraits) {
      portrait.complete = true
      portrait.naturalWidth = portrait.naturalHeight = 64
    }
    entry.redraw()
    expect(drawImage).toHaveBeenCalledTimes(4)
    expect(fillText).not.toHaveBeenCalled()
    expect(entry.styles).toHaveLength(1)
    expect(entry.styles[0]?.getText()).toBeNull()
    expect(grouped.get(members.map((member) => ({ ...member, count: 10 })), referenceDataset.echoes, { showText: false })).toBe(entry)
    expect(grouped.get(members, referenceDataset.echoes, { showText: true })).not.toBe(entry)
    grouped.dispose()
  })

  it('composes visible cluster targets and preserves the individual point selection', () => {
    let zoom = 3
    const points = createPointLayers(() => zoom)
    const { echoLocations } = libraryLocations({ version: 1, points: [mixedPoint('first'), mixedPoint('second')] }, referenceDataset)
    const cluster = new Feature({
      geometry: new Point([0, 0]),
      features: echoLocations.map((location) => new Feature({ geometry: new Point([0, 0]), location })),
    })
    points.update(echoLocations, [], [], referenceDataset.echoes)
    const render = points.layers[1]?.getStyleFunction()
    const mixed = render?.(cluster, 1)
    expect(Array.isArray(mixed) ? mixed[0]?.getImage()?.getScale() : undefined).toBe(54 / 44 / 2)
    expect(Array.isArray(mixed) && mixed.every((style) => style.getText() === null)).toBe(true)
    expect(portraits.map(({ src }) => src).sort()).toEqual([smallEcho.iconUrl, eliteEcho.iconUrl].sort())
    expect(cluster.get('locations')).toEqual(echoLocations)

    points.update(echoLocations, [], [], referenceDataset.echoes, new Set([smallEcho.id]))
    const filtered = render?.(cluster, 1)
    expect(Array.isArray(filtered) ? filtered[0]?.getImage()?.getScale() : undefined).toBe(PORTRAIT_MARKER_SIZES[1] / 44 / 2)
    expect(Array.isArray(filtered) && filtered.every((style) => style.getText() === null)).toBe(true)
    expect(cluster.get('locations')).toEqual(echoLocations)

    cluster.set('features', cluster.get('features').slice(0, 1))
    const single = render?.(cluster, 1)
    expect(Array.isArray(single) ? single.length : undefined).toBe(1)
    expect(Array.isArray(single) && single.every((style) => style.getText() === null)).toBe(true)

    zoom = 2
    expect(render?.(cluster, 1)).toBeUndefined()
    expect(cluster.get('locations')).toEqual([])
    points.dispose()
  })
})
