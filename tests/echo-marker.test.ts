import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import RegularShape from 'ol/style/RegularShape.js'
import Icon from 'ol/style/Icon.js'
import ImageState from 'ol/ImageState.js'
import { shared as iconImageCache } from 'ol/style/IconImageCache.js'
import { libraryLocations } from '../src/domain/point-library.ts'
import { createEchoMarkerStyles } from '../src/map/echo-marker.ts'
import { createEditorMarkerStyles } from '../src/map/editor-marker.ts'
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

class NavigationImage extends EventTarget {
  width = 0
  height = 0
  complete = false
  src = ''
  decode(): Promise<void> {
    return this.width ? Promise.resolve() : Promise.reject(new Error('图标加载失败'))
  }
  finish(loaded: boolean): void {
    this.complete = true
    this.width = this.height = loaded ? 64 : 0
    this.dispatchEvent(new Event(loaded ? 'load' : 'error'))
  }
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
  it('retries failed navigation artwork without retaining error callbacks or changing the export width', async () => {
    const fixture = referenceDataset.navigationPoints.find(({ kind, iconUrl }) => kind === 'beacon' && iconUrl)
    if (!fixture) throw new Error('Missing beacon fixture')
    const navigation = { ...fixture, iconUrl: 'https://test.invalid/export-navigation-retry.png' }
    vi.stubGlobal('Image', NavigationImage)
    vi.stubGlobal('HTMLImageElement', NavigationImage)
    const attempts: ReturnType<typeof createPointLayers>[] = []
    function attempt(exportMode = true) {
      const points = createPointLayers(() => false, { exportMode, pixelRatio: 4 })
      attempts.push(points)
      const feature = new Feature({ geometry: new Point([0, 0]), mapPoint: { category: 'navigation', location: navigation } })
      const render = () => points.layers[2]?.getStyleFunction()?.(feature, 1)
      const style = render()
      const icon = Array.isArray(style) ? style[0]?.getImage() : undefined
      if (!(icon instanceof Icon)) throw new Error('Missing navigation icon')
      const image = icon.getImage(1)
      if (!(image instanceof NavigationImage)) throw new Error('Missing navigation artwork')
      return { points, icon, image, render }
    }
    try {
      const first = attempt()
      const cached = iconImageCache.get(navigation.iconUrl, null)
      const dispatch = cached.dispatchEvent.bind(cached)
      const callbackErrors: unknown[] = []
      const observe = vi.spyOn(cached, 'dispatchEvent').mockImplementation((event) => {
        try { return dispatch(event) }
        catch (error) { callbackErrors.push(error); return undefined }
      })
      first.icon.load()
      first.image.finish(false)
      await vi.waitFor(() => expect(first.icon.getImageState()).toBe(ImageState.ERROR))
      await expect(first.points.ready()).rejects.toThrow('图标加载失败')
      observe.mockRestore()
      first.points.dispose()

      const retry = attempt()
      expect(retry.image).not.toBe(first.image)
      expect(retry.icon.getImageState()).toBe(ImageState.IDLE)
      retry.icon.load()
      retry.image.finish(true)
      await retry.icon.ready()
      await expect(retry.points.ready()).resolves.toBeUndefined()
      retry.render()
      retry.render()
      expect(retry.image.width * (retry.icon.getScaleArray()[0] ?? 0)).toBeCloseTo(21.6)
      const mainMap = attempt(false)
      expect(mainMap.image).toBe(retry.image)
      expect(mainMap.icon.getScale()).toBe(0.28)
      expect(callbackErrors).toEqual([])
    } finally {
      for (const points of attempts) points.dispose()
      iconImageCache.set(navigation.iconUrl, null, null)
    }
  })

  it.each([ImageState.LOADING, ImageState.LOADED])('keeps cached navigation artwork in state %s when recreating an exporter', async (state) => {
    const fixture = referenceDataset.navigationPoints.find(({ kind, iconUrl }) => kind === 'beacon' && iconUrl)
    if (!fixture) throw new Error('Missing beacon fixture')
    const navigation = { ...fixture, iconUrl: `https://test.invalid/export-navigation-cache-${state}.png` }
    vi.stubGlobal('Image', NavigationImage)
    vi.stubGlobal('HTMLImageElement', NavigationImage)
    const first = createPointLayers(() => false, { exportMode: true })
    const second = createPointLayers(() => false, { exportMode: true })
    const feature = new Feature({ geometry: new Point([0, 0]), mapPoint: { category: 'navigation', location: navigation } })
    try {
      const style = first.layers[2]?.getStyleFunction()?.(feature, 1)
      const icon = Array.isArray(style) ? style[0]?.getImage() : undefined
      if (!(icon instanceof Icon)) throw new Error('Missing navigation icon')
      const image = icon.getImage(1)
      if (!(image instanceof NavigationImage)) throw new Error('Missing navigation artwork')
      icon.load()
      if (state === ImageState.LOADED) {
        image.finish(true)
        await icon.ready()
      }
      const reused = second.layers[2]?.getStyleFunction()?.(feature, 1)
      const reusedIcon = Array.isArray(reused) ? reused[0]?.getImage() : undefined
      expect(reusedIcon?.getImage(1)).toBe(image)
      expect(reusedIcon?.getImageState()).toBe(state)
      if (state === ImageState.LOADING) {
        image.finish(true)
        await icon.ready()
      }
    } finally {
      first.dispose()
      second.dispose()
      iconImageCache.set(navigation.iconUrl, null, null)
    }
  })

  it('preserves the requested width of navigation artwork while its resource is still loading', () => {
    const navigation = referenceDataset.navigationPoints.find(({ kind, iconUrl }) => kind === 'beacon' && iconUrl)
    if (!navigation) throw new Error('Missing beacon fixture')
    const points = createPointLayers(() => false, { exportMode: true, pixelRatio: 5 })
    const scale = vi.spyOn(Icon.prototype, 'setScale')
    try {
      points.update([], [navigation], [], referenceDataset.echoes)
      const style = points.layers[2]?.getStyleFunction()?.(new Feature({ geometry: new Point([0, 0]), mapPoint: { category: 'navigation', location: navigation } }), 1)
      const icon = Array.isArray(style) ? style[0]?.getImage() : undefined
      expect(icon).toBeInstanceOf(Icon)
      expect(icon?.getSize()).toBeNull()
      expect(scale).not.toHaveBeenCalled()
    } finally {
      scale.mockRestore()
      points.dispose()
    }
  })
  it('shrinks export portraits once without changing main-map markers or losing pixel density', () => {
    const { echoLocations } = libraryLocations({ version: 1, points: [mixedPoint()] }, referenceDataset)
    const widths = [false, true].map((exportMode) => {
      const points = createPointLayers(() => false, { exportMode, pixelRatio: exportMode ? 5 : 2 })
      points.update(echoLocations, [], [], referenceDataset.echoes)
      const feature = new Feature({ geometry: new Point([0, 0]), features: echoLocations.map((location) => new Feature({ geometry: new Point([0, 0]), mapPoint: { category: 'echo', location } })) })
      const render = points.layers[1]?.getStyleFunction()
      const result = render?.(feature, 1)
      const image = Array.isArray(result) ? result[0]?.getImage() : undefined
      const width = (image?.getSize()?.[0] ?? 0) * (image?.getScaleArray()[0] ?? 0)
      render?.(feature, 1)
      expect((image?.getSize()?.[0] ?? 0) * (image?.getScaleArray()[0] ?? 0)).toBe(width)
      points.dispose()
      return width
    })
    expect(widths[0]).toBeGreaterThan(50)
    expect(widths[1]).toBeCloseTo((widths[0] ?? 0) * 0.6)
  })
  it('uses a diamond editor selection that cannot hide the portrait during decluttering', () => {
    const editor = createEditorMarkerStyles(() => {})
    const point = mixedPoint()
    const normal = editor.get(point, referenceDataset.echoes, false)
    const selected = editor.get(point, referenceDataset.echoes, true)
    const outline = selected[0]?.getImage()
    expect(outline?.getDeclutterMode()).toBe('none')
    expect(outline instanceof RegularShape ? outline.getPoints() : null).toBe(4)
    expect(selected.slice(1)).toEqual(normal)
    expect(normal[0]?.getImage()).toBeDefined()
    expect(normal).toHaveLength(1)
    editor.dispose()
  })

  it('uses a diamond for editor navigation placeholders', () => {
    const editor = createEditorMarkerStyles(() => {})
    const [style] = editor.get({
      gravityType: null,
      id: 'navigation', kind: 'navigation', status: 'draft', name: '', navigationKind: 'beacon', mode: 'fast-travel',
      stateId: 8, countryId: null, levelId: null, coordinate: { x: 0, y: 0, z: null }, note: '',
    }, referenceDataset.echoes, false)
    const image = style?.getImage()
    expect(image instanceof RegularShape ? image.getPoints() : null).toBe(4)
    editor.dispose()
  })

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
    let resolution = 4
    const points = createPointLayers()
    const { echoLocations } = libraryLocations({ version: 1, points: [mixedPoint('first'), mixedPoint('second')] }, referenceDataset)
    const cluster = new Feature({
      geometry: new Point([0, 0]),
      features: echoLocations.map((location) => new Feature({ geometry: new Point([0, 0]), mapPoint: { category: 'echo', location } })),
    })
    points.update(echoLocations, [], [], referenceDataset.echoes)
    const render = points.layers[1]?.getStyleFunction()
    const mixed = render?.(cluster, resolution)
    expect(Array.isArray(mixed) ? mixed[0]?.getImage()?.getScale() : undefined).toBe(54 / 44 / 2)
    expect(Array.isArray(mixed) && mixed.every((style) => style.getText() === null)).toBe(true)
    expect(portraits.map(({ src }) => src).sort()).toEqual([smallEcho.iconUrl, eliteEcho.iconUrl].sort())
    expect(cluster.get('locations')).toEqual(echoLocations)

    points.update(echoLocations, [], [], referenceDataset.echoes, new Set([smallEcho.id]))
    const filtered = render?.(cluster, resolution)
    expect(Array.isArray(filtered) ? filtered[0]?.getImage()?.getScale() : undefined).toBe(PORTRAIT_MARKER_SIZES[1] / 44 / 2)
    expect(Array.isArray(filtered) && filtered.every((style) => style.getText() === null)).toBe(true)
    expect(cluster.get('locations')).toEqual(echoLocations)

    cluster.set('features', cluster.get('features').slice(0, 1))
    const single = render?.(cluster, resolution)
    expect(Array.isArray(single) ? single.length : undefined).toBe(1)
    expect(Array.isArray(single) && single.every((style) => style.getText() === null)).toBe(true)

    resolution = 8
    expect(render?.(cluster, resolution)).toBeUndefined()
    expect(cluster.get('locations')).toEqual([])
    points.dispose()
  })
})
