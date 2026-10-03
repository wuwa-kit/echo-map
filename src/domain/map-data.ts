import { mapDatasetSchema } from './schema.ts'
import type { MapCatalogData, MapData, MapDataset, MapPointLocations } from './types.ts'

export function assembleMapDataset(map: MapData, catalog: MapCatalogData, locations: MapPointLocations): MapDataset {
  const echoes = new Map(catalog.echoes.map((echo) => [echo.id, echo]))
  return mapDatasetSchema.parse({
    ...map,
    source: { ...map.source, ...catalog.source, sourceUrls: { ...map.source.sourceUrls, ...catalog.source.sourceUrls } },
    report: catalog.report,
    sonatas: catalog.sonatas,
    echoes: catalog.echoes,
    navigationPointGroups: [],
    echoLocations: locations.echoLocations.map((point) => {
      const echo = echoes.get(point.echoId)
      if (!echo) throw new Error(`点位 ${point.id} 引用了不存在的声骸 ${point.echoId}`)
      return { ...point, iconUrl: echo.iconUrl }
    }),
    navigationPoints: [],
  })
}
