import { mapDatasetSchema } from './schema.ts'
import type { MapCatalogData, MapData, MapDataset, MapPointLocations, PointIconDefinition } from './types.ts'

export function assembleMapDataset(map: MapData, catalog: MapCatalogData, locations: MapPointLocations): MapDataset {
  const echoes = new Map(catalog.echoes.map((echo) => [echo.id, echo]))
  const icons = new Map(catalog.pointIcons.map((icon) => [icon.id, icon]))
  function restoreIcon<T extends { id: string, iconId: string }>(point: T): Omit<T, 'iconId'> & Omit<PointIconDefinition, 'id'> {
    const { iconId, ...location } = point
    const icon = icons.get(iconId)
    if (!icon) throw new Error(`点位 ${point.id} 引用了不存在的图标 ${iconId}`)
    return { ...location, typeId: icon.typeId, typeName: icon.typeName, iconUrl: icon.iconUrl }
  }
  return mapDatasetSchema.parse({
    ...map,
    source: { ...map.source, ...catalog.source, sourceUrls: { ...map.source.sourceUrls, ...catalog.source.sourceUrls } },
    report: catalog.report,
    sonatas: catalog.sonatas,
    echoes: catalog.echoes,
    navigationPointGroups: catalog.navigationPointGroups,
    echoLocations: locations.echoLocations.map((point) => {
      const echo = echoes.get(point.echoId)
      if (!echo) throw new Error(`点位 ${point.id} 引用了不存在的声骸 ${point.echoId}`)
      return { ...point, iconUrl: echo.iconUrl }
    }),
    navigationPoints: locations.navigationPoints.map(restoreIcon),
  })
}
