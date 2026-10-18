import Map from 'ol/Map.js'
import View from 'ol/View.js'
import Projection from 'ol/proj/Projection.js'
import { unByKey } from 'ol/Observable.js'
import type { EventsKey } from 'ol/events.js'
import { createPointLayers } from './point-layers.ts'
import { createRouteLayer } from './route-layer.ts'
import { createOfficialBaseLayers } from './official-base-layers.ts'
import { createFloorLayers } from './floor-layers.ts'
import { drawExportAnnotations, nearbyExportPlaces } from './export-place-names.ts'
import { EXPORT_RATIO } from '../route/export-layout.ts'
import type { ExportCard } from '../route/export-layout.ts'
import type { EchoMapLocation, GravityType, MapDataset, NavigationPoint, RoutePlanResult, RouteResult } from '../domain/types.ts'

export interface RouteExportSnapshot {
  route: RouteResult
  routePlan?: RoutePlanResult
  dataset: MapDataset
  locations: readonly EchoMapLocation[]
  navigationPoints: readonly NavigationPoint[]
  echoIds: readonly string[]
  gravity: GravityType
  title: string
  usesOfficial: boolean
  createdAt: string
}

export function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function createRouteExportView(projection: Projection, center: [number, number], resolution: number): View {
  // Pixel projections cannot derive the default resolution from metres per unit.
  return new View({ projection, center, resolution, minResolution: 0.14, maxResolution: 4, enableRotation: false })
}

export function createRouteExportRenderer(snapshot: RouteExportSnapshot) {
  const target = document.createElement('div')
  Object.assign(target.style, { position: 'fixed', left: '-10000px', top: '0', pointerEvents: 'none' })
  document.body.append(target)
  const projection = new Projection({ code: 'KURO:CRS-SIMPLE', units: 'pixels' })
  const points = createPointLayers(() => false, { exportMode: true, pixelRatio: EXPORT_RATIO })
  const route = createRouteLayer(points.layers)
  const floors = createFloorLayers(projection, { dimBase: true })
  let tileError = false
  const base = createOfficialBaseLayers((failed) => { tileError = failed }, { cacheSize: 16 })
  const map = new Map({ target, pixelRatio: EXPORT_RATIO, controls: [], interactions: [], layers: [...points.layers, route.layer], view: createRouteExportView(projection, [0, 0], 1) })
  const activeEchoIds = new Set(snapshot.echoIds)
  let stateId: number | undefined
  let gravityType: GravityType | undefined

  async function renderComplete(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    let key: EventsKey | undefined
    try {
      await abortable(new Promise<void>((resolve) => {
        key = map.once('rendercomplete', () => resolve())
        map.renderSync()
      }), signal)
    } finally {
      if (key) unByKey(key)
    }
    if (tileError) throw new Error('底图瓦片加载失败，请重试')
  }

  async function renderCard(card: ExportCard, signal: AbortSignal, showNumber = true): Promise<HTMLCanvasElement> {
      if (card.panels?.length) {
        const canvas = document.createElement('canvas')
        canvas.width = card.width
        canvas.height = card.mapHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法创建地图图片')
        context.fillStyle = '#10231f'
        context.fillRect(0, 0, canvas.width, canvas.height)
        try {
          for (const [index, panel] of card.panels.entries()) {
            signal.throwIfAborted()
            const image = await renderCard(panel, signal, false)
            try { context.drawImage(image, panel.x, panel.y) }
            finally { image.width = image.height = 0 }
            const previous = card.panels[index - 1]
            if (previous) {
              const top = previous.y + previous.height
              const center = (top + panel.y) / 2
              const x = card.width / 2
              context.strokeStyle = '#c49bff'
              context.fillStyle = '#c49bff'
              context.lineWidth = 2 * EXPORT_RATIO
              context.setLineDash([EXPORT_RATIO, 3 * EXPORT_RATIO])
              context.beginPath()
              context.moveTo(x, top + 2 * EXPORT_RATIO)
              context.lineTo(x, panel.y - 2 * EXPORT_RATIO)
              context.stroke()
              context.setLineDash([])
              context.beginPath()
              context.moveTo(x - 4 * EXPORT_RATIO, center - 3 * EXPORT_RATIO)
              context.lineTo(x, center + 3 * EXPORT_RATIO)
              context.lineTo(x + 4 * EXPORT_RATIO, center - 3 * EXPORT_RATIO)
              context.stroke()
            }
          }
          drawExportAnnotations(context, [], card)
          return canvas
        } catch (error) {
          canvas.width = canvas.height = 0
          throw error
        }
      }
      const loading = AbortSignal.any([signal, AbortSignal.timeout(30000)])
      const state = snapshot.dataset.states.find(({ id }) => id === card.stateId)
      if (!state) throw new Error('路线底图不存在')
      if (stateId !== state.id || gravityType !== card.gravityType) {
        floors.clear()
        base.update(map, state, snapshot.dataset.source, card.gravityType ?? snapshot.gravity)
        stateId = state.id
        gravityType = card.gravityType
      }
      const size = card.mapSize
      target.style.width = `${size[0]}px`
      target.style.height = `${size[1]}px`
      map.setSize(size)
      map.setView(createRouteExportView(projection, card.center, card.resolution))
      const extent = map.getView().calculateExtent(size)
      if (card.levelId) await floors.prepare(state, snapshot.dataset.source, card.levelId, () => extent, loading)
      floors.update(map, state, snapshot.dataset.source, card.levelId)
      const ids = new Set(card.nodes.map(({ point }) => point.id))
      const locations = snapshot.locations.filter(({ id }) => ids.has(id))
      const navigationPoints = snapshot.navigationPoints.filter(({ id }) => ids.has(id))
      const countries = new Set([...locations, ...navigationPoints].flatMap(({ countryId }) => countryId === null ? [] : [countryId]))
      const places = nearbyExportPlaces(snapshot.dataset.regionLabels, card, countries)
      const floor = state.layeredMaps.flatMap(({ floors }) => floors).find(({ id }) => id === card.levelId)
      if (!places.length) places.push({ name: floor ? `${state.name} · ${floor.name}` : state.name, anchor: [6, 6], outside: false })
      points.update(locations, navigationPoints, [], snapshot.dataset.echoes, activeEchoIds, card.levelId)
      points.finishInteraction(extent, card.resolution, projection)
      route.update({ points: card.nodes.map(({ point }) => ({ ...point, teleportFrom: undefined })), totalCost: 0, algorithm: snapshot.route.algorithm, startPointId: null })
      await renderComplete(loading)
      await abortable(points.ready(), loading)
      await abortable(document.fonts.ready, loading)
      await renderComplete(loading)
      const canvas = document.createElement('canvas')
      canvas.width = card.width
      canvas.height = card.mapHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('无法创建地图图片')
      context.fillStyle = '#10231f'
      context.fillRect(0, 0, canvas.width, canvas.height)
      // Route masking stays on its own layer canvas before compositing over the map.
      const scaleX = card.width / (size[0] ?? 1)
      const scaleY = card.mapHeight / (size[1] ?? 1)
      if (!target.querySelector('canvas')) throw new Error('地图图层未完成渲染')
      for (const layerCanvas of target.querySelectorAll('canvas')) {
        if (!layerCanvas.width || !layerCanvas.height) continue
        const transform = new DOMMatrixReadOnly(layerCanvas.style.transform || undefined)
        context.setTransform(transform.a * scaleX, transform.b * scaleY, transform.c * scaleX, transform.d * scaleY, transform.e * scaleX, transform.f * scaleY)
        context.globalAlpha = Number(layerCanvas.parentElement?.style.opacity || layerCanvas.style.opacity || 1)
        context.drawImage(layerCanvas, 0, 0)
      }
      context.resetTransform()
      context.globalAlpha = 1
      drawExportAnnotations(context, places, card, showNumber)
      // Fail here with a useful route label if a resource tainted the canvas.
      context.getImageData(0, 0, 1, 1)
      return canvas
  }
  return {
    render: renderCard,
    dispose(): void {
      map.setTarget(undefined)
      floors.dispose()
      points.dispose()
      route.dispose()
      base.dispose()
      map.dispose()
      target.remove()
    },
  }
}
