import { buffer, intersects } from 'ol/extent.js'
import type { Extent } from 'ol/extent.js'
import Feature from 'ol/Feature.js'
import { fromExtent } from 'ol/geom/Polygon.js'
import LayerGroup from 'ol/layer/Group.js'
import ImageLayer from 'ol/layer/Image.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import ImageStatic from 'ol/source/ImageStatic.js'
import ImageState from 'ol/ImageState.js'
import Fill from 'ol/style/Fill.js'
import Style from 'ol/style/Style.js'
import { unByKey } from 'ol/Observable.js'
import type { EventsKey } from 'ol/events.js'
import type Projection from 'ol/proj/Projection.js'
import type Map from 'ol/Map.js'
import type { MapStateDefinition, SourceManifest } from '../domain/types.ts'
import { layeredTileExtent } from './projection.ts'
import { floorExtent } from './floor-coverage.ts'
import { layeredTileUrl } from './official-source.ts'

interface FloorTile {
  path: string
  levelId: string
  layer: ImageLayer<ImageStatic>
  event: EventsKey | null
  retry: boolean
}

interface FloorGroupEntry {
  key: string
  state: MapStateDefinition
  manifest: SourceManifest
  layer: LayerGroup
  tiles: FloorTile[]
}

interface FloorSelection {
  entry: FloorGroupEntry
  levelId: string
}

type FloorMap = Pick<Map, 'addLayer' | 'removeLayer'>
const MAX_CACHED_BYTES = 64 * 1024 * 1024
const MAX_CACHED_GROUPS = 8
const TILE_BYTES = 1024 * 1024 * 4

export function createFloorLayers(projection: Projection, options: {
  dimBase?: boolean
  onError?: (levelId: string) => void
} = {}) {
  let active: FloorSelection | null = null
  let prepared: FloorSelection | null = null
  let preparationController: AbortController | null = null
  let prefetchController: AbortController | null = null
  let attachedMap: FloorMap | null = null
  let visibleExtent: Extent | null = null
  const entries = new globalThis.Map<string, FloorGroupEntry>()
  const maskSource = new VectorSource()
  const mask = new VectorLayer({
    source: maskSource,
    zIndex: 5,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: new Style({ fill: new Fill({ color: 'rgba(0, 0, 0, 0.6)' }) }),
  })

  function imageState(source: ImageStatic): number {
    return source.getImage(source.getImageExtent(), 1, 1, projection).getState()
  }

  function disposeEntry(entry: FloorGroupEntry): void {
    entries.delete(entry.key)
    entry.layer.getLayers().clear()
    for (const tile of entry.tiles) {
      if (tile.event) unByKey(tile.event)
      tile.layer.getSource()?.dispose()
      tile.layer.dispose()
    }
    entry.layer.dispose()
  }

  function trimCache(): void {
    const cost = (entry: FloorGroupEntry) => entry.tiles.reduce((bytes, tile) => {
      const source = tile.layer.getSource()
      const state = source && imageState(source)
      return bytes + (state === ImageState.LOADED || state === ImageState.LOADING ? TILE_BYTES : 0)
    }, 0)
    let bytes = [...entries.values()].reduce((sum, entry) => sum + cost(entry), 0)
    for (const entry of entries.values()) {
      if (bytes <= MAX_CACHED_BYTES && entries.size <= MAX_CACHED_GROUPS) break
      // Active and transitioning groups stay complete even when they exceed the idle cache budget.
      if (entry === active?.entry || entry === prepared?.entry) continue
      bytes -= cost(entry)
      disposeEntry(entry)
    }
  }

  function cancelPrefetch(): void {
    prefetchController?.abort()
    prefetchController = null
  }

  function detach(): void {
    cancelPrefetch()
    if (active) attachedMap?.removeLayer(active.entry.layer)
    attachedMap?.removeLayer(mask)
    maskSource.clear()
    active = null
    attachedMap = null
    visibleExtent = null
  }

  function cancelPreparation(): void {
    prepared = null
    preparationController?.abort()
    preparationController = null
    trimCache()
  }

  function clear(): void {
    cancelPreparation()
    detach()
    for (const entry of entries.values()) disposeEntry(entry)
  }

  function ensureContext(state: MapStateDefinition, manifest: SourceManifest): void {
    if ([...entries.values()].some((entry) => entry.state !== state || entry.manifest !== manifest)) clear()
  }

  function resetSource(entry: FloorGroupEntry, tile: FloorTile): void {
    const imageExtent = layeredTileExtent(tile.path, entry.manifest.tileWidth)
    if (!imageExtent) throw new Error('楼层瓦片坐标无效')
    if (tile.event) unByKey(tile.event)
    const previous = tile.layer.getSource()
    const source = new ImageStatic({
      url: layeredTileUrl(entry.manifest.mapResourceHash, entry.state.id, tile.path),
      imageExtent, projection, crossOrigin: 'anonymous',
    })
    tile.event = source.on('imageloaderror', () => {
      if (active?.entry === entry && (!visibleExtent || intersects(visibleExtent, imageExtent))) options.onError?.(active.levelId)
    })
    tile.layer.setSource(source)
    tile.retry = false
    previous?.dispose()
  }

  function reuse(state: MapStateDefinition, manifest: SourceManifest, levelId: string): FloorGroupEntry {
    const group = state.layeredMaps.find(({ floors }) => floors.some(({ id }) => id === levelId))
    if (!group) throw new Error('楼层不存在')
    // The point editor retains its single-floor display; the explorer shows the entire group.
    const key = options.dimBase ? group.id : levelId
    let entry = entries.get(key)
    if (!entry) {
      entry = { key, state, manifest, layer: new LayerGroup(), tiles: [] }
      for (const floor of group.floors) {
        if (!options.dimBase && floor.id !== levelId) continue
        for (const path of floor.tiles) {
          if (!layeredTileExtent(path, manifest.tileWidth)) continue
          const tile: FloorTile = { path, levelId: floor.id, layer: new ImageLayer({ opacity: 1, zIndex: 2 }), event: null, retry: false }
          resetSource(entry, tile)
          entry.tiles.push(tile)
          entry.layer.getLayers().push(tile.layer)
        }
      }
    }
    entries.delete(key)
    entries.set(key, entry)
    return entry
  }

  function load(source: ImageStatic, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted()
      const image = source.getImage(source.getImageExtent(), 1, 1, projection)
      if (image.getState() === ImageState.LOADED) { resolve(); return }
      const events: EventsKey[] = []
      function finish(error?: unknown): void {
        unByKey(events)
        signal.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve()
      }
      function abort(): void { finish(signal.reason) }
      events.push(source.once('imageloadend', () => finish()))
      events.push(source.once('imageloaderror', () => finish(new Error('楼层图片加载失败'))))
      signal.addEventListener('abort', abort, { once: true })
      image.load()
    })
  }

  async function loadSources(sources: ImageStatic[], signal: AbortSignal, concurrency: number): Promise<void> {
    const queue = sources.values()
    await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, async () => {
      for (const source of queue) {
        signal.throwIfAborted()
        await load(source, signal)
      }
    }))
  }

  function pendingSources(selection: FloorSelection, viewportExtent: Extent): ImageStatic[] {
    // Sorting a copy prioritizes the selected floor without changing layer or list order.
    return [...selection.entry.tiles].sort((left, right) => Number(right.levelId === selection.levelId) - Number(left.levelId === selection.levelId))
      .flatMap(({ layer }) => {
        const source = layer.getSource()
        return source && intersects(viewportExtent, source.getImageExtent()) && imageState(source) !== ImageState.LOADED ? [source] : []
      })
  }

  function prepare(state: MapStateDefinition, manifest: SourceManifest, levelId: string, getViewportExtent: () => Extent, signal: AbortSignal): void | Promise<void> {
    ensureContext(state, manifest)
    cancelPreparation()
    cancelPrefetch()
    signal.throwIfAborted()
    const entry = reuse(state, manifest, levelId)
    if (!entry.tiles.length) throw new Error('楼层没有可用图片')
    for (const tile of entry.tiles) {
      const source = tile.layer.getSource()
      if (source && (tile.retry || imageState(source) === ImageState.ERROR)) resetSource(entry, tile)
    }
    const selection = { entry, levelId }
    prepared = selection
    trimCache()
    if (!pendingSources(selection, getViewportExtent()).length) return
    return prepareImages(selection, getViewportExtent, signal)
  }

  async function prepareImages(selection: FloorSelection, getViewportExtent: () => Extent, signal: AbortSignal): Promise<void> {
    const controller = new AbortController()
    preparationController = controller
    const timeout = setTimeout(() => controller.abort(new Error('楼层图片加载超时')), 15000)
    const loadingSignal = AbortSignal.any([signal, controller.signal])
    try {
      while (true) {
        loadingSignal.throwIfAborted()
        const visible = pendingSources(selection, getViewportExtent())
        if (!visible.length) break
        await loadSources(visible, loadingSignal, 3)
      }
    } catch (error) {
      if (controller.signal.aborted && !signal.aborted) {
        for (const tile of selection.entry.tiles) {
          const source = tile.layer.getSource()
          if (source && imageState(source) !== ImageState.LOADED) tile.retry = true
        }
      }
      if (prepared === selection) cancelPreparation()
      throw error
    } finally {
      clearTimeout(timeout)
      controller.abort()
      if (preparationController === controller) preparationController = null
      trimCache()
    }
  }

  function update(map: FloorMap, state: MapStateDefinition, manifest: SourceManifest, levelId: string | null): void {
    ensureContext(state, manifest)
    if (levelId === null) { cancelPreparation(); detach(); trimCache(); return }
    const ready = prepared?.levelId === levelId ? prepared.entry : null
    if (ready) prepared = null
    else cancelPreparation()
    const entry = ready ?? reuse(state, manifest, levelId)
    if (!entry.tiles.length) return
    if (active?.entry !== entry || attachedMap !== map) {
      detach()
      attachedMap = map
      if (options.dimBase) {
        maskSource.addFeature(new Feature(fromExtent(state.tileExtent.extent)))
        map.addLayer(mask)
      }
      map.addLayer(entry.layer)
    }
    active = { entry, levelId }
    for (const tile of entry.tiles) tile.layer.setZIndex(tile.levelId === levelId ? 10 : 2)
    trimCache()
  }

  function updateViewport(extent: Extent): void {
    visibleExtent = [...extent]
    cancelPrefetch()
    if (!active || prepared) return
    if (pendingSources(active, extent).some((source) => imageState(source) === ImageState.ERROR)) options.onError?.(active.levelId)
    const width = (extent[2] ?? 0) - (extent[0] ?? 0)
    const height = (extent[3] ?? 0) - (extent[1] ?? 0)
    const nearby = buffer(extent, Math.max(0, Math.min(width, height) * 0.25))
    const sources = pendingSources(active, nearby).filter((source) => imageState(source) === ImageState.IDLE).slice(0, 4)
    if (!sources.length) { trimCache(); return }
    const controller = new AbortController()
    prefetchController = controller
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
    void loadSources(sources, signal, 2).catch(() => undefined).finally(() => {
      controller.abort()
      if (prefetchController === controller) prefetchController = null
      trimCache()
    })
  }

  function dispose(): void {
    clear()
    maskSource.dispose()
    mask.dispose()
  }

  function getExtent(): Extent | null {
    const floor = active?.entry.state.layeredMaps.flatMap(({ floors }) => floors).find(({ id }) => id === active?.levelId)
    return floorExtent(floor, active?.entry.manifest.tileWidth ?? 1024)
  }

  return { update, prepare, updateViewport, cancelPreparation, clear, getExtent, dispose }
}
