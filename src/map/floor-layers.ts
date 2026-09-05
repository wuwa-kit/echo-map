import { createEmpty, extend, isEmpty } from 'ol/extent.js'
import type { Extent } from 'ol/extent.js'
import ImageLayer from 'ol/layer/Image.js'
import ImageStatic from 'ol/source/ImageStatic.js'
import type Projection from 'ol/proj/Projection.js'
import type Map from 'ol/Map.js'
import type { MapStateDefinition, SourceManifest } from '../domain/types.ts'
import { layeredTileExtent } from './projection.ts'
import { layeredTileUrl } from './official-source.ts'

export function createFloorLayers(projection: Projection) {
  let layers: ImageLayer<ImageStatic>[] = []
  let attachedMap: Map | null = null
  let extent: Extent | null = null

  function clear(): void {
    for (const layer of layers) {
      attachedMap?.removeLayer(layer)
      layer.getSource()?.dispose()
      layer.dispose()
    }
    layers = []
    attachedMap = null
    extent = null
  }

  function update(map: Map, state: MapStateDefinition, manifest: SourceManifest, levelId: string | null): void {
    clear()
    const floor = state.layeredMaps.flatMap(({ floors }) => floors).find(({ id }) => id === levelId)
    if (!floor || levelId === null) {
      return
    }

    const combinedExtent = createEmpty()
    layers = floor.tiles.flatMap((tilePath) => {
      const imageExtent = layeredTileExtent(tilePath, manifest.tileWidth)
      if (!imageExtent) {
        return []
      }
      extend(combinedExtent, imageExtent)
      return [new ImageLayer({
        source: new ImageStatic({
          url: layeredTileUrl(manifest.mapResourceHash, state.id, tilePath),
          imageExtent,
          projection,
          crossOrigin: 'anonymous',
        }),
        opacity: 0.94,
        zIndex: 10,
      })]
    })
    attachedMap = map
    layers.forEach((layer) => map.addLayer(layer))
    extent = isEmpty(combinedExtent) ? null : combinedExtent
  }

  return { update, clear, getExtent: () => extent, dispose: clear }
}
