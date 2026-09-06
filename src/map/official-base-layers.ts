import type Map from 'ol/Map.js'
import { unByKey } from 'ol/Observable.js'
import type { EventsKey } from 'ol/events.js'
import type { GravityType, MapStateDefinition, SourceManifest } from '../domain/types.ts'
import { createOfficialTileLayer } from './official-source.ts'

interface BaseLayerEntry {
  layer: ReturnType<typeof createOfficialTileLayer>
  events: EventsKey[]
  failed: boolean
}

// Own only the basemap layers. Changing gravity must never reconfigure the map's View.
export function createOfficialBaseLayers(reportError: (failed: boolean) => void) {
  let map: Pick<Map, 'removeLayer' | 'getLayers'> | null = null
  let state: MapStateDefinition | null = null
  let manifest: SourceManifest | null = null
  let active: GravityType = 1
  const entries = new globalThis.Map<GravityType, BaseLayerEntry>()

  function remove(gravity: GravityType): void {
    const entry = entries.get(gravity)
    if (!entry) return
    unByKey(entry.events)
    map?.removeLayer(entry.layer)
    entry.layer.getSource()?.dispose()
    entry.layer.dispose()
    entries.delete(gravity)
  }

  function dispose(): void {
    for (const gravity of entries.keys()) remove(gravity)
    map = null
    state = null
    manifest = null
  }

  function show(): void {
    if (!map || !state || !manifest) return
    let entry = entries.get(active)
    if (!entry) {
      const gravity = active
      const layer = createOfficialTileLayer(state, manifest, gravity)
      const next: BaseLayerEntry = { layer, events: [], failed: false }
      const source = layer.getSource()
      if (source) next.events.push(source.on('tileloaderror', () => {
        next.failed = true
        if (active === gravity) reportError(true)
      }))
      entries.set(gravity, next)
      entry = next
      map.getLayers().insertAt(0, layer)
    }
    for (const [gravity, cached] of entries) cached.layer.setVisible(gravity === active)
    reportError(entry.failed)
  }

  return {
    update(nextMap: Pick<Map, 'removeLayer' | 'getLayers'>, nextState: MapStateDefinition, nextManifest: SourceManifest, gravity: GravityType): void {
      if (map !== nextMap || state !== nextState || manifest !== nextManifest) {
        dispose()
        map = nextMap
        state = nextState
        manifest = nextManifest
      }
      active = gravity
      show()
    },
    retry(): void {
      remove(active)
      show()
    },
    dispose,
  }
}
