import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import Projection from 'ol/proj/Projection.js'
import Cluster from 'ol/source/Cluster.js'
import Icon from 'ol/style/Icon.js'
import RegularShape from 'ol/style/RegularShape.js'
import Style from 'ol/style/Style.js'
import { createPointLayers, mapFeaturePointIds, mapFeaturesPointIds } from '../src/map/point-layers.ts'
import { mapResolutionForZoom } from '../src/map/point-visibility.ts'
import type { MapDisplayPoint, NavigationPoint, RegionLabel, RoutePoint, RouteResult } from '../src/domain/types.ts'
import { navigationPoint, navigationTestDataset as referenceDataset } from './fixtures/navigation-points.ts'

class MarkerPath {
  moveTo() {}
  lineTo() {}
  closePath() {}
}

class MarkerImage {
  complete = false
  naturalWidth = 0
  naturalHeight = 0
  src = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  decode(): Promise<void> { return Promise.resolve() }
  removeAttribute() {}
}

beforeEach(() => {
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('Path2D', MarkerPath)
  vi.stubGlobal('Image', MarkerImage)
  vi.stubGlobal('HTMLImageElement', MarkerImage)
  vi.stubGlobal('document', { createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect() {}, scale() {}, setTransform() {}, fill() {}, save() {}, restore() {}, clip() {}, drawImage() {}, fillText() {},
      imageSmoothingQuality: 'high', fillStyle: '', font: '', textAlign: 'center', textBaseline: 'middle',
    }),
  }) })
})
afterEach(() => vi.unstubAllGlobals())

describe('map display layer integration', () => {
  it('marks floor point icons on the base map with the official-style stacked badge', () => {
    const points = createPointLayers()
    const point = referenceDataset.navigationPoints[0]
    const echo = referenceDataset.echoLocations[0]
    if (!point || !echo) throw new Error('需要地图点位测试数据')
    const navigation: NavigationPoint[] = [
      { ...point, id: 'base', levelId: null, kind: 'beacon', iconUrl: '' },
      { ...point, id: 'floor', levelId: 'a1', kind: 'beacon', iconUrl: '' },
    ]
    points.update([
      { ...echo, id: 'base-echo', levelId: null },
      { ...echo, id: 'floor-echo', levelId: 'a1', coordinate: { ...echo.coordinate, mapX: echo.coordinate.mapX + 200 } },
    ], navigation, [], referenceDataset.echoes, undefined, null)
    const badgeShapes = (rendered: Style | Style[] | void) => {
      return (Array.isArray(rendered) ? rendered : rendered ? [rendered] : [])
        .flatMap((style) => {
          const image = style.getImage()
          return image instanceof RegularShape ? [{
            points: image.getPoints(),
            angle: image.getAngle(),
            displacement: image.getDisplacement(),
            scale: image.getScaleArray(),
            fill: image.getFill()?.getColor() ?? null,
            stroke: image.getStroke()?.getColor() ?? null,
          }] : []
        })
        .filter(({ points }) => points === 4 || points === 6)
    }
    const expectedBadge = (markerWidth: number, markerHeight: number) => {
      const layoutScale = Math.min(markerWidth, markerHeight) / 260
      const flatDistance = 50 * layoutScale
      const badgeScale = flatDistance / (Math.sqrt(3) * 7)
      const x = markerWidth / 2 - 70 * layoutScale - flatDistance / 2
      const y = -(markerHeight / 2 - 30 * layoutScale - 7 * badgeScale)
      return [
        { points: 6, angle: 0, displacement: [x, y], scale: [badgeScale, badgeScale], fill: 'rgba(0, 0, 0, 0.72)', stroke: '#e8dd93' },
        { points: 4, angle: 0, displacement: [x, y - 1.25 * badgeScale], scale: [1.08 * badgeScale, 0.65 * badgeScale], fill: '#7c754e', stroke: null },
        { points: 4, angle: 0, displacement: [x, y + 2.5 * badgeScale], scale: [1.15 * badgeScale, 0.7 * badgeScale], fill: null, stroke: '#fff' },
      ]
    }

    const navigationLayer = points.layers[2]
    const navigationFeatures = navigationLayer?.getSource()?.getFeatures() ?? []
    const navigationRender = navigationLayer?.getStyleFunction()
    const navigationBadges = (id: string) => {
      const feature = navigationFeatures.find((candidate) => mapFeaturePointIds(candidate)?.[0] === id)
      return badgeShapes(feature ? navigationRender?.(feature, 2) : undefined)
    }
    expect(navigationFeatures.flatMap((feature) => mapFeaturePointIds(feature) ?? [])).toEqual(['base', 'floor'])
    expect(navigationBadges('base')).toEqual([])
    expect(navigationBadges('floor')).toEqual(expectedBadge(36, 36))

    const echoClusters = points.layers[1]?.getSource()
    if (!(echoClusters instanceof Cluster)) throw new Error('需要声骸聚类图层')
    echoClusters.loadFeatures([-10000, -10000, 10000, 10000], 2, new Projection({ code: 'TEST:FLOOR-BADGE', units: 'pixels' }))
    const echoRender = points.layers[1]?.getStyleFunction()
    const pointX = (feature: Feature): number => {
      const geometry = feature.getGeometry()
      return geometry instanceof Point ? geometry.getCoordinates()[0] ?? 0 : 0
    }
    const echoFeatures = echoClusters.getFeatures().sort((left, right) => pointX(left) - pointX(right))
    expect(echoFeatures).toHaveLength(2)
    expect(badgeShapes(echoFeatures[0] ? echoRender?.(echoFeatures[0], 2) : undefined)).toEqual([])
    const floorEchoStyles = echoFeatures[1] ? echoRender?.(echoFeatures[1], 2) : undefined
    const floorEchoMarker = Array.isArray(floorEchoStyles) ? floorEchoStyles[0]?.getImage() : undefined
    expect(floorEchoMarker).toBeInstanceOf(Icon)
    if (!(floorEchoMarker instanceof Icon)) throw new Error('需要声骸图标样式')
    const markerWidth = floorEchoMarker.getWidth()
    const markerHeight = floorEchoMarker.getHeight()
    if (!markerWidth || !markerHeight) throw new Error('需要声骸图标尺寸')
    expect(badgeShapes(floorEchoStyles)).toEqual(expectedBadge(markerWidth, markerHeight))

    points.update([], navigation, [], [], undefined, 'a1')
    expect(navigationBadges('floor')).toEqual([])
    const floorPoint = navigation.find(({ id }) => id === 'floor')
    if (!floorPoint) throw new Error('需要分层定位点')
    expect(badgeShapes(points.styleFor({ category: 'navigation', location: floorPoint }))).toEqual(expectedBadge(36, 36))
    expect(badgeShapes(points.styleFor({ category: 'navigation', location: { ...floorPoint, levelId: null } }))).toEqual([])
    points.dispose()
  })

  it('does not duplicate the built-in badge on layered entrance icons', () => {
    const points = createPointLayers()
    const point = referenceDataset.navigationPoints[0]
    if (!point) throw new Error('需要地图点位测试数据')
    const entrance: NavigationPoint = {
      ...point,
      id: 'layered-entrance',
      levelId: 'a1',
      typeId: 'FCRK',
      typeName: '分层入口',
      kind: 'entrance',
      mode: 'entrance',
      iconUrl: 'https://web-static.kurobbs.com/adminConfig/52/props_namephoto/1762501267031.png',
    }
    points.update([], [entrance], [], [], undefined, null)
    const layer = points.layers[2]
    const feature = layer?.getSource()?.getFeatures()[0]
    const rendered = feature ? layer?.getStyleFunction()?.(feature, 2) : undefined
    const styles = Array.isArray(rendered) ? rendered : rendered ? [rendered] : []
    const badgePartCount = styles.filter((style) => {
      const image = style.getImage()
      return style.getText()?.getText() === '◆'
        || image instanceof RegularShape && (image.getPoints() === 4 || image.getPoints() === 6)
    }).length
    expect(badgePartCount).toBe(0)
    points.dispose()
  })

  it('places base context under the floor mask and keeps current-floor points and teleports above it', () => {
    const points = createPointLayers()
    const echo = referenceDataset.echoLocations[0]
    const point = referenceDataset.navigationPoints[0]
    if (!echo || !point) throw new Error('需要地图点位测试数据')
    const navigation: NavigationPoint[] = [
      { ...point, id: 'base-ordinary', levelId: null, mode: 'landmark', iconUrl: '' },
      { ...point, id: 'floor-ordinary', levelId: 'a1', mode: 'landmark', iconUrl: '' },
      { ...point, id: 'base-travel', levelId: null, mode: 'fast-travel', iconUrl: '' },
      { ...point, id: 'other-travel', levelId: 'a2', mode: 'fast-travel', iconUrl: '' },
    ]
    points.update([
      { ...echo, id: 'base-echo', levelId: null }, { ...echo, id: 'floor-echo', levelId: 'a1' },
    ], navigation, [], referenceDataset.echoes, undefined, 'a1')
    const [labels, foregroundEcho, foregroundNavigation, backgroundEcho, backgroundNavigation] = points.layers
    expect(labels?.getZIndex()).toBeLessThan(5)
    expect(backgroundEcho?.getZIndex()).toBeLessThan(5)
    expect(backgroundNavigation?.getZIndex()).toBeLessThan(5)
    expect(foregroundEcho?.getZIndex()).toBeGreaterThan(10)
    expect(foregroundNavigation?.getZIndex()).toBeGreaterThan(10)
    expect(backgroundNavigation?.getSource()?.getFeatures().flatMap((feature) => mapFeaturePointIds(feature) ?? [])).toEqual(['base-ordinary'])
    expect(foregroundNavigation?.getSource()?.getFeatures().flatMap((feature) => mapFeaturePointIds(feature) ?? [])).toEqual(['floor-ordinary', 'base-travel', 'other-travel'])
    points.finishInteraction([-100000, -100000, 100000, 100000], 2, new Projection({ code: 'TEST:FLOORS', units: 'pixels' }))
    for (const [layer, id] of [[foregroundEcho, 'floor-echo'], [backgroundEcho, 'base-echo']] as const) {
      const source = layer?.getSource()
      if (!(source instanceof Cluster)) throw new Error('需要独立的声骸聚类图层')
      const features = source.getFeatures()
      expect(features).toHaveLength(1)
      const cluster = features[0]
      if (!cluster) throw new Error('需要声骸聚合点')
      const members: Feature[] = cluster.get('features')
      expect(members).toHaveLength(1)
      expect(members.flatMap((feature) => mapFeaturePointIds(feature) ?? [])).toEqual([id])
      expect(layer?.getStyleFunction()?.(cluster, mapResolutionForZoom(8.99))).toBeUndefined()
      expect(layer?.getStyleFunction()?.(cluster, mapResolutionForZoom(9))).toBeDefined()
    }
    points.update([], navigation.slice(0, 1), [], [])
    expect(backgroundNavigation?.getSource()?.getFeatures()).toEqual([])
    expect(backgroundEcho?.getSource()?.getFeatures()).toEqual([])
    expect(foregroundNavigation?.getSource()?.getFeatures()).toHaveLength(1)
    points.dispose()
  })

  it('updates point and label batches while dragging and animating', () => {
    const points = createPointLayers()
    for (const layer of points.layers) {
      expect(layer.getUpdateWhileInteracting()).toBe(true)
      expect(layer.getUpdateWhileAnimating()).toBe(true)
    }
    points.dispose()
  })

  it('keeps all existing clusters during zoom frames and reclusters once at the final resolution', () => {
    let moving = false
    const points = createPointLayers(() => moving)
    const location = referenceDataset.echoLocations[0]
    if (!location) throw new Error('需要声骸点测试数据')
    points.update([0, 50, 10000].map((x) => ({
      ...location, id: `point-${x}`, coordinate: { ...location.coordinate, mapX: x, mapY: 0 },
    })), [], [], referenceDataset.echoes)
    const clusters = points.layers[1]?.getSource()
    if (!(clusters instanceof Cluster)) throw new Error('需要声骸聚类图层')
    const projection = new Projection({ code: 'TEST:POINTS', units: 'pixels' })
    const extent = [-100, -100, 200, 100]
    clusters.loadFeatures(extent, 2, projection)
    const initial = clusters.getFeatures()
    expect(initial).toHaveLength(2)
    const refresh = vi.spyOn(clusters, 'refresh')
    moving = true
    for (const resolution of [1.8, 1.5, 1, 0.75, 0.5]) clusters.loadFeatures(extent, resolution, projection)
    expect(refresh).not.toHaveBeenCalled()
    expect(clusters.getFeatures()).toEqual(initial)
    expect(clusters.getFeaturesInExtent([9900, -100, 10100, 100])).toHaveLength(1)
    moving = false
    points.finishInteraction(extent, 0.5, projection)
    expect(refresh).toHaveBeenCalledOnce()
    expect(clusters.getFeatures()).toHaveLength(3)
    points.finishInteraction(extent, 0.5, projection)
    expect(refresh).toHaveBeenCalledOnce()
    points.dispose()
  })

  it('uses marker-sized clustering and separates neighboring points before maximum zoom', () => {
    const points = createPointLayers()
    const location = referenceDataset.echoLocations[0]
    if (!location) throw new Error('需要声骸点测试数据')
    points.update([
      { ...location, id: 'point-a', coordinate: { ...location.coordinate, mapX: -626, mapY: -8335 } },
      { ...location, id: 'point-b', coordinate: { ...location.coordinate, mapX: -613, mapY: -8346 } },
    ], [], [], referenceDataset.echoes)
    const clusters = points.layers[1]?.getSource()
    if (!(clusters instanceof Cluster)) throw new Error('需要声骸聚类图层')
    const projection = new Projection({ code: 'TEST:MAX-ZOOM', units: 'pixels' })
    const extent = [-1000, -9000, 0, -8000]

    points.finishInteraction(extent, 0.5, projection)
    expect(clusters.getDistance()).toBe(32)
    expect(clusters.getFeatures()).toHaveLength(1)

    points.finishInteraction(extent, 0.4, projection)
    expect(clusters.getDistance()).toBe(32)
    expect(clusters.getFeatures()).toHaveLength(2)

    points.finishInteraction(extent, 0.248, projection, true)
    expect(clusters.getDistance()).toBe(0)
    expect(clusters.getFeatures()).toHaveLength(2)

    points.dispose()

    const exportPoints = createPointLayers(undefined, { exportMode: true })
    const exportClusters = exportPoints.layers[1]?.getSource()
    if (!(exportClusters instanceof Cluster)) throw new Error('需要导出声骸聚类图层')
    expect(exportClusters.getDistance()).toBeCloseTo(32 * 0.6)
    exportPoints.dispose()
  })

  it('builds initial clusters during an interaction and immediately respects changed point filters', () => {
    const points = createPointLayers(() => true)
    const location = referenceDataset.echoLocations[0]
    if (!location) throw new Error('需要声骸点测试数据')
    points.update([location], [], [], referenceDataset.echoes)
    const clusters = points.layers[1]?.getSource()
    if (!(clusters instanceof Cluster)) throw new Error('需要声骸聚类图层')
    clusters.loadFeatures([-10000, -10000, 10000, 10000], 2, new Projection({ code: 'TEST:POINTS', units: 'pixels' }))
    expect(clusters.getFeatures()).toHaveLength(1)
    points.update([], [], [], referenceDataset.echoes)
    expect(clusters.getFeatures()).toEqual([])
    points.dispose()
  })

  it('switches text navigation levels on zoom without rebuilding features or making labels selectable', () => {
    const points = createPointLayers()
    const labels: RegionLabel[] = [1, 2, 3].map((level) => ({
      id: `label-${level}`, name: `地区 ${level}`, level, stateId: 8, countryId: 1,
      coordinate: { rawX: 10, rawY: 20, mapX: 30, mapY: 40 },
    }))
    points.update([], [], labels, [])
    const layer = points.layers[0]
    const features = layer?.getSource()?.getFeatures() ?? []
    const render = layer?.getStyleFunction()
    expect(features).toHaveLength(3)
    for (const feature of features) {
      const point = feature.get('mapPoint') as MapDisplayPoint
      if (point.category !== 'region-name') throw new Error('需要文字定位点')
      const { level } = point.location
      const geometry = feature.getGeometry()
      if (!(geometry instanceof Point)) throw new Error('文字定位需要 XY 点几何')
      expect(geometry.getCoordinates()).toEqual([30, 40])
      expect(Boolean(render?.(feature, 64))).toBe(level === 2)
      for (const zoom of [0, 8.99, 9, 16, 35]) {
        expect(Boolean(render?.(feature, mapResolutionForZoom(zoom)))).toBe(level === (zoom < 9 ? 2 : 3))
      }
      expect(mapFeaturePointIds(feature)).toBeUndefined()
      if (level === 1) continue
      const style = render?.(feature, mapResolutionForZoom(level === 2 ? 0 : 9))
      expect(style).toBeInstanceOf(Style)
      if (!(style instanceof Style)) throw new Error('需要文字样式')
      expect(style.getText()?.getFill()?.getColor()).toBe('#ffffff')
      expect(style.getText()?.getStroke()).toBeNull()
      expect(mapFeaturePointIds(feature)).toBeUndefined()
    }
    expect(layer?.getSource()?.getFeatures()).toEqual(features)
    points.dispose()
  })

  it('keeps nexuses visible at every scale and adds beacons from step 9', () => {
    const points = createPointLayers()
    const point = referenceDataset.navigationPoints[0]
    if (!point) throw new Error('需要定位点测试数据')
    const navigation: NavigationPoint[] = [
      { ...point, id: 'nexus', kind: 'nexus', pointType: 'central-beacon', iconUrl: '' },
      { ...point, id: 'beacon', kind: 'beacon', pointType: 'small-beacon', iconUrl: '' },
    ]
    points.update([], navigation, [], [])
    const layer = points.layers[2]
    const features = layer?.getSource()?.getFeatures() ?? []
    const render = layer?.getStyleFunction()
    expect(features).toHaveLength(2)
    if (!render) throw new Error('定位点需要缩放样式函数')
    for (const feature of features) {
      const isNexus = mapFeaturePointIds(feature)?.[0] === 'nexus'
      expect(Boolean(render(feature, 64))).toBe(isNexus)
      for (const zoom of [0, 8.99, 9, 16, 35, 0]) {
        expect(Boolean(render(feature, mapResolutionForZoom(zoom)))).toBe(isNexus || zoom >= 9)
      }
    }
    expect(layer?.getSource()?.getFeatures()).toEqual(features)
    points.dispose()
  })

  it('does not repopulate manually filtered points when zoom changes', () => {
    const points = createPointLayers()
    const point = referenceDataset.navigationPoints[0]
    if (!point) throw new Error('需要定位点测试数据')
    const navigation = { ...point, kind: 'service' as const, pointType: 'service' as const, iconUrl: '' }
    points.update([], [navigation], [], [])
    const layer = points.layers[2]
    const feature = layer?.getSource()?.getFeatures()[0]
    if (!feature) throw new Error('定位点必须生成图层 Feature')
    const render = layer?.getStyleFunction()
    expect(render?.(feature, 4)).toBeUndefined()
    expect(render?.(feature, 2)).toBeDefined()
    expect(mapFeaturePointIds(feature)).toEqual([navigation.id])
    points.update([], [], [], [])
    expect(layer?.getSource()?.getFeatures()).toEqual([])
    expect(layer?.getSource()?.getFeaturesInExtent([-100000, -100000, 100000, 100000])).toEqual([])
    points.dispose()
  })

  it('forces only teleports used by the visible routes and restores normal visibility when routes change', () => {
    const points = createPointLayers()
    const echo = referenceDataset.echoLocations[0]
    if (!echo) throw new Error('需要声骸测试数据')
    const navigation: NavigationPoint[] = [
      navigationPoint('small-beacon'),
      navigationPoint('weekly-boss'),
      { ...navigationPoint('small-beacon'), id: 'other-floor', levelId: 'a2' },
      { ...navigationPoint('service'), id: 'custom-travel', mode: 'fast-travel', gameCoordinate: null },
      { ...navigationPoint('normal-boss'), mode: 'landmark' },
      navigationPoint('gondola'),
      navigationPoint('layer-entrance'),
      navigationPoint('service'),
    ]
    const label: RegionLabel = {
      id: 'region', name: '测试地区', level: 2, stateId: 8, countryId: 1,
      coordinate: { rawX: 0, rawY: 0, mapX: 0, mapY: 0 },
    }
    points.update([{ ...echo, levelId: 'a1' }], navigation.map((point) => ({ ...point, iconUrl: '' })), [label], referenceDataset.echoes, undefined, 'a1')
    const projection = new Projection({ code: 'TEST:ROUTE-VISIBILITY', units: 'pixels' })
    points.finishInteraction([-100000, -100000, 100000, 100000], 64, projection)
    const navigationLayers = [points.layers[2], points.layers[4]]
    const originalFeatures = navigationLayers.map((layer) => layer?.getSource()?.getFeatures())
    const echoLayer = points.layers[1]
    const echoFeature = echoLayer?.getSource()?.getFeatures()[0]
    const labelLayer = points.layers[0]
    const labelFeature = labelLayer?.getSource()?.getFeatures()[0]
    if (!echoFeature || !labelFeature) throw new Error('需要声骸和地名图层')

    const target: RoutePoint = {
      id: echo.id, name: '声骸目标', echoId: null, stateId: 8, levelId: 'a1',
      coordinate: { x: 10, y: 20, z: 0 }, mapCoordinate: [10, 20],
    }
    const firstRoute: RouteResult = {
      points: [
        { ...target, teleportFrom: { ...target, id: 'test:small-beacon', isTeleportArrival: true, mapCoordinate: [100, 200] } },
        { ...target, id: 'second-target', teleportFrom: { ...target, id: 'other-floor', levelId: 'a2' } },
      ],
      totalCost: 10, algorithm: 'exact', startPointId: 'test:small-beacon',
    }
    const secondRoute: RouteResult = {
      points: [{ ...target, teleportFrom: { ...target, id: 'test:weekly-boss' } }],
      totalCost: 10, algorithm: 'exact', startPointId: 'test:weekly-boss',
    }
    const walkingRoute: RouteResult = {
      points: [target, { ...target, id: 'walking-target' }],
      totalCost: 10, algorithm: 'exact', startPointId: null,
    }
    const scenarios = [
      { routes: [], ids: [] },
      { routes: [firstRoute], ids: ['test:small-beacon', 'other-floor'] },
      { routes: [firstRoute, secondRoute], ids: ['test:small-beacon', 'other-floor', 'test:weekly-boss'] },
      { routes: [secondRoute], ids: ['test:weekly-boss'] },
      { routes: [walkingRoute], ids: [] },
      { routes: [firstRoute], ids: ['test:small-beacon', 'other-floor'] },
      { routes: [], ids: [] },
    ]
    for (const [scenarioIndex, { routes, ids }] of scenarios.entries()) {
      const revisions = navigationLayers.map((layer) => layer?.getRevision() ?? 0)
      points.setVisibleRoutes(routes)
      for (const [index, layer] of navigationLayers.entries()) {
        expect(layer?.getSource()?.getFeatures()).toEqual(originalFeatures[index])
        if (scenarioIndex > 0) expect(layer?.getRevision()).toBeGreaterThan(revisions[index] ?? 0)
        for (const feature of originalFeatures[index] ?? []) {
          const point = feature.get('mapPoint') as MapDisplayPoint
          if (point.category !== 'navigation') throw new Error('需要定位点图层')
          for (const resolution of [128, 64, 16]) {
            expect(Boolean(layer?.getStyleFunction()?.(feature, resolution))).toBe(ids.includes(point.location.id) || point.location.kind === 'boss')
          }
          expect(layer?.getStyleFunction()?.(feature, 2)).toBeDefined()
        }
      }
      expect(echoLayer?.getStyleFunction()?.(echoFeature, 64)).toBeUndefined()
      expect(echoLayer?.getStyleFunction()?.(echoFeature, mapResolutionForZoom(9))).toBeDefined()
      expect(labelLayer?.getStyleFunction()?.(labelFeature, 64)).toBeDefined()
      expect(labelLayer?.getStyleFunction()?.(labelFeature, mapResolutionForZoom(9))).toBeUndefined()
    }
    points.setVisibleRoutes([firstRoute])
    points.update([], [], [], [])
    expect(navigationLayers.flatMap((layer) => layer?.getSource()?.getFeatures() ?? [])).toEqual([])
    points.dispose()
  })

  it.each(['clustered', 'individual'] as const)('forces the current editor category at every scale with %s echoes', (echoGrouping) => {
    let forcedCategory: 'echo' | 'navigation' | null = null
    const points = createPointLayers(() => false, { echoGrouping, forceVisibleCategory: () => forcedCategory })
    const echo = referenceDataset.echoLocations[0]
    if (!echo) throw new Error('需要声骸测试数据')
    const service = navigationPoint('service')
    const labels: RegionLabel[] = [1, 2, 3].map((level) => ({
      id: `label-${level}`, name: `地区 ${level}`, level, stateId: 8, countryId: 1,
      coordinate: { rawX: 0, rawY: 0, mapX: 0, mapY: 0 },
    }))
    points.update([
      { ...echo, id: 'floor-echo', levelId: 'a1' },
      { ...echo, id: 'base-echo', levelId: null },
    ], [
      { ...service, id: 'floor-service', levelId: 'a1', iconUrl: '' },
      { ...service, id: 'base-service', levelId: null, iconUrl: '' },
    ], labels, referenceDataset.echoes, undefined, 'a1')
    points.finishInteraction([-100000, -100000, 100000, 100000], 64, new Projection({ code: 'TEST:EDITOR-VISIBILITY', units: 'pixels' }))

    for (const mode of [null, 'navigation', 'echo', 'navigation', null] as const) {
      forcedCategory = mode
      for (const zoom of [0, 8.99, 9, 15.99, 16, 35, 0]) {
        const resolution = mapResolutionForZoom(zoom)
        for (const index of [1, 3]) {
          const layer = points.layers[index]
          const feature = layer?.getSource()?.getFeatures()[0]
          if (!feature) throw new Error('需要声骸图层')
          const visible = Boolean(layer?.getStyleFunction()?.(feature, resolution))
          expect(visible).toBe(mode === 'echo' || zoom >= 9)
          if (visible) expect(mapFeaturePointIds(feature)).toEqual([index === 1 ? 'floor-echo' : 'base-echo'])
          else if (echoGrouping === 'clustered') expect(mapFeaturePointIds(feature)).toBeUndefined()
        }
        for (const index of [2, 4]) {
          const layer = points.layers[index]
          const feature = layer?.getSource()?.getFeatures()[0]
          if (!feature) throw new Error('需要定位点图层')
          expect(Boolean(layer?.getStyleFunction()?.(feature, resolution))).toBe(mode === 'navigation' || zoom >= 16)
        }
        const labelLayer = points.layers[0]
        for (const feature of labelLayer?.getSource()?.getFeatures() ?? []) {
          const point = feature.get('mapPoint') as MapDisplayPoint
          if (point.category !== 'region-name') throw new Error('需要地名图层')
          expect(Boolean(labelLayer?.getStyleFunction()?.(feature, resolution))).toBe(point.location.level === (zoom < 9 ? 2 : 3))
        }
      }
    }
    points.dispose()
  })

  it('uses the shared zoom rules with individual features by default and de-duplicates overlapping hits', () => {
    const points = createPointLayers(() => false, { echoGrouping: 'individual' })
    const echo = referenceDataset.echoLocations[0]
    const boss = referenceDataset.navigationPoints.find(({ kind }) => kind === 'boss')
    if (!echo || !boss) throw new Error('需要声骸与 BOSS 测试数据')
    points.update([echo], [boss], [], referenceDataset.echoes)

    const echoSource = points.layers[1]?.getSource()
    expect(echoSource).not.toBeInstanceOf(Cluster)
    const echoFeature = echoSource?.getFeatures()[0]
    const bossFeature = points.layers[2]?.getSource()?.getFeatures()[0]
    if (!echoFeature || !bossFeature) throw new Error('编辑地图需要独立点位 Feature')

    expect(points.layers[1]?.getStyleFunction()?.(echoFeature, mapResolutionForZoom(8.99))).toBeUndefined()
    expect(points.layers[1]?.getStyleFunction()?.(echoFeature, mapResolutionForZoom(9))).toBeDefined()
    expect(points.layers[2]?.getStyleFunction()?.(bossFeature, 64)).toBeDefined()
    expect(points.layers[2]?.getStyleFunction()?.(bossFeature, mapResolutionForZoom(9))).toBeDefined()
    expect(mapFeaturesPointIds([bossFeature, bossFeature, echoFeature])).toEqual([boss.id, echo.id])
    points.dispose()
  })
})
