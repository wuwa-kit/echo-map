import { z } from 'zod'
import type { RefinementCtx } from 'zod'
import type { MapDataset } from './types.ts'

const finiteNumber = z.number().finite()
const nullableString = z.string().nullable()
export const gravityTypeSchema = z.union([z.literal(1), z.literal(2)])

export const officialAssetCategorySchema = z.enum(['echo', 'sonata', 'navigation', 'tile', 'floor', 'gravity'])
const assetUrlSchema = z.string().url().startsWith('https://')
export const officialAssetSchema = z.object({
  id: z.string().min(1),
  category: officialAssetCategorySchema,
  name: z.string().min(1),
  url: assetUrlSchema,
  previewUrl: assetUrlSchema,
  sourceUrl: assetUrlSchema,
  fetchedAt: z.string().min(1),
  stateIds: z.array(z.number().int()),
  referenceIds: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string().min(1)),
  recordCount: z.number().int().positive(),
})

export const navigationKindSchema = z.enum([
  'nexus', 'beacon', 'tacet-field', 'training-ground', 'hologram', 'boss', 'domain',
  'endgame', 'challenge', 'service', 'local-transit', 'entrance', 'landmark', 'unknown',
])
export const navigationModeSchema = z.enum(['fast-travel', 'local-transit', 'entrance', 'landmark', 'unknown'])

const authoredPointBase = {
  gravityType: gravityTypeSchema.nullable().default(null),
  id: z.string().min(1).max(100),
  status: z.enum(['draft', 'verified', 'imported']),
  officialIds: z.array(z.string().min(1).max(100)).min(1).optional(),
  replacesOfficialIds: z.array(z.string().min(1).max(100)).min(1).optional(),
  stateId: z.number().int(),
  countryId: z.number().int().nullable(),
  levelId: z.string().min(1).nullable(),
  coordinate: z.object({
    x: z.number().int().safe().nullable(),
    y: z.number().int().safe().nullable(),
    z: z.number().int().safe().nullable(),
  }).strict(),
  note: z.string().max(2000),
}

export const authoredPointSchema = z.discriminatedUnion('kind', [
  z.object({
    ...authoredPointBase,
    kind: z.literal('echo'),
    members: z.array(z.object({ echoId: z.string().min(1), count: z.number().int().positive().max(999) }).strict()).max(100),
    compositionStatus: z.enum(['partial', 'complete']).optional(),
  }).strict(),
  z.object({
    ...authoredPointBase,
    kind: z.literal('navigation'),
    name: z.string().max(100),
    navigationKind: navigationKindSchema,
    mode: navigationModeSchema,
  }).strict(),
]).superRefine((point, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message })
  if (point.kind === 'echo' && new Set(point.members.map(({ echoId }) => echoId)).size !== point.members.length) {
    issue('同种怪物只能有一行，请合并数量')
  }
  if (point.status === 'imported' && (point.coordinate.z !== 0 || !point.officialIds?.length)) {
    issue('官方导入点必须保留来源 ID，Z 固定为 0')
  }
  if (point.status !== 'draft') {
    if (Object.values(point.coordinate).some((value) => value === null)) issue('核验点位必须填写完整的整数 XYZ')
    if (point.kind === 'echo' && point.members.length === 0) issue('刷取点至少需要一种怪物')
    if (point.status === 'verified' && point.kind === 'navigation' && (!point.name.trim() || point.navigationKind === 'unknown' || point.mode === 'unknown')) {
      issue('定位点需要名称、明确的类型和传送能力')
    }
    if (point.status === 'verified' && point.kind === 'navigation' && ['boss', 'domain', 'challenge'].includes(point.navigationKind) && point.mode !== 'fast-travel') {
      issue('BOSS、副本与挑战定位点应标记为可直接传送')
    }
  }
})

export const pointLibrarySchema = z.object({
  version: z.literal(1),
  points: z.array(authoredPointSchema).max(100000),
}).strict().superRefine(({ points }, context) => {
  const ids = new Set<string>()
  for (const point of points) {
    if (ids.has(point.id)) context.addIssue({ code: 'custom', message: `重复点位 ID：${point.id}` })
    ids.add(point.id)
  }
})

export const gameCoordinateSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  z: finiteNumber,
})

const officialCoordinateSchema = z.object({
  rawX: finiteNumber,
  rawY: finiteNumber,
  mapX: finiteNumber,
  mapY: finiteNumber,
})

const mapLocationBaseShape = {
  id: z.string().min(1),
  stateId: z.number().int(),
  countryId: z.number().int().nullable(),
  coordinate: officialCoordinateSchema,
}

export const regionLabelSchema = z.object({
  ...mapLocationBaseShape,
  name: z.string().min(1),
  countryId: z.number().int(),
  level: z.number().int().positive(),
  coordinate: officialCoordinateSchema.strict(),
}).strict()

export const mapZoomRangeSchema = z.object({
  minZoom: finiteNumber.nonnegative(),
  maxZoom: finiteNumber.nullable(),
}).strict().refine(({ minZoom, maxZoom }) => maxZoom === null || maxZoom > minZoom, {
  message: '缩放范围上限必须大于下限，或以 null 表示无上限',
})

const pointBaseShape = {
  gravityType: gravityTypeSchema.nullable().default(null),
  ...mapLocationBaseShape,
  typeId: z.string().min(1),
  typeName: z.string().min(1),
  iconUrl: z.string(),
  layeredMapId: nullableString,
  levelId: nullableString,
  gameCoordinate: gameCoordinateSchema.nullable(),
  quality: z.enum(['official-provisional', 'manual-verified', 'example']),
}

const sonataEchoIdsSchema = z.array(z.string().min(1)).refine(
  (ids) => new Set(ids).size === ids.length,
  { message: '套装声骸 ID 列表不能重复' },
)

const wikiCatalogueShape = {
  sonatas: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    iconUrl: z.string(),
    sourceId: z.number().int(),
    c1EchoIds: sonataEchoIdsSchema,
    c3EchoIds: sonataEchoIdsSchema,
  })).min(1),
  echoes: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    iconUrl: z.string(),
    sonataIds: z.tuple([z.string().min(1)]).rest(z.string().min(1)),
    cost: z.union([z.literal(1), z.literal(3)]),
    sourceId: z.number().int(),
  })).min(1),
}

function validateSonataEchoIds({ sonatas, echoes }: Pick<MapDataset, 'sonatas' | 'echoes'>, context: RefinementCtx): void {
  const echoById = new Map(echoes.map((echo) => [echo.id, echo]))
  const sonataById = new Map(sonatas.map((sonata) => [sonata.id, sonata]))
  sonatas.forEach((sonata, index) => {
    for (const [field, cost] of [['c1EchoIds', 1], ['c3EchoIds', 3]] as const) {
      sonata[field].forEach((echoId, memberIndex) => {
        const echo = echoById.get(echoId)
        if (!echo || echo.cost !== cost || !echo.sonataIds.includes(sonata.id)) {
          context.addIssue({
            code: 'custom', path: ['sonatas', index, field, memberIndex],
            message: `${sonata.name} 的 ${field} 引用了不存在、COST 不符或不属于该套装的声骸 ${echoId}`,
          })
        }
      })
    }
  })
  echoes.forEach((echo, index) => {
    for (const sonataId of echo.sonataIds) {
      const sonata = sonataById.get(sonataId)
      const field = echo.cost === 1 ? 'c1EchoIds' : 'c3EchoIds'
      if (!sonata || !sonata[field].includes(echo.id)) {
        context.addIssue({
          code: 'custom', path: ['echoes', index, 'sonataIds'],
          message: `${echo.name} 引用的套装 ${sonataId} 不存在或 ${field} 遗漏了该声骸`,
        })
      }
    }
  })
}

export const wikiCatalogueSchema = z.object(wikiCatalogueShape).superRefine(validateSonataEchoIds)

const navigationRegionIdsSchema = z.array(z.string().min(1)).refine(
  (ids) => new Set(ids).size === ids.length, { message: '地图导航目的地不能重复' },
)

function validateMapNavigation(dataset: Pick<MapDataset, 'mapNavigation' | 'regionLabels' | 'states'>, context: RefinementCtx): void {
  const regionById = new Map(dataset.regionLabels.map((region) => [region.id, region]))
  const states = new Set(dataset.states.map(({ id }) => id))
  const countries = new Set<number>()
  dataset.mapNavigation.forEach((country, index) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', path: ['mapNavigation', index], message })
    if (countries.has(country.id)) issue('地图导航大区 ID 重复')
    countries.add(country.id)
    const regionIds = new Set(country.regionIds)
    for (const id of regionIds) {
      const region = regionById.get(id)
      if (!region || region.countryId !== country.id || !states.has(region.stateId)) issue(`无效地图导航目的地：${id}`)
    }
    const groupIds = new Set<string>()
    const groupedRegionIds = new Set<string>()
    for (const group of country.groups) {
      if (groupIds.has(group.id)) issue('地图导航分组 ID 重复')
      groupIds.add(group.id)
      for (const id of group.regionIds) {
        if (!regionIds.has(id) || groupedRegionIds.has(id)) issue(`地图分组目的地不存在或重复：${id}`)
        groupedRegionIds.add(id)
      }
    }
    if (country.groups.length && groupedRegionIds.size !== regionIds.size) issue('地图分组遗漏了大区目的地')
  })
}

function validateMapGravity(dataset: Pick<MapDataset, 'states' | 'echoLocations' | 'navigationPoints'>, context: RefinementCtx): void {
  dataset.states.forEach((state, index) => {
    const tiles = new Set(state.tileIds)
    state.gravityTiles.forEach((path, tileIndex) => {
      if (!tiles.has(`${state.id}_${path.slice(3, -4)}`)) context.addIssue({
        code: 'custom', path: ['states', index, 'gravityTiles', tileIndex], message: '反重力瓦片超出当前地图网格',
      })
    })
  })
  for (const key of ['echoLocations', 'navigationPoints'] as const) {
    dataset[key].forEach((point, index) => {
      if (point.gravityType === 2 && !dataset.states.some((state) => state.id === point.stateId && state.gravityTiles.length > 0)) context.addIssue({
        code: 'custom', path: [key, index, 'gravityType'], message: '反重力点位缺少对应底图资源',
      })
    })
  }
}

export const floorCoverageTileSchema = z.object({
  tile: z.string().regex(/^-?\d+_-?\d+\.png$/u),
  size: z.number().int().positive().max(1024),
  runs: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().positive()])),
}).superRefine(({ size, runs }, context) => {
  let previousEnd = -1
  for (const [index, [start, end]] of runs.entries()) {
    if (start <= previousEnd || start >= end || end > size * size) {
      context.addIssue({ code: 'custom', path: ['runs', index], message: '楼层覆盖区间必须有序、合并且处于图片范围内' })
    }
    previousEnd = end
  }
})

const mapDatasetObjectSchema = z.object({
  version: z.literal(3),
  source: z.object({
    generatedAt: z.string(),
    wikiFetchedAt: z.string(),
    mapFetchedAt: z.string(),
    mapResourceHash: z.string().min(1),
    tileWidth: z.number().positive(),
    coordinateRate: z.number().positive(),
    coordinateScaleBase: z.number().positive(),
    sourceUrls: z.object({
      echoCatalogue: z.string(),
      sonataCatalogue: z.string(),
      officialMap: z.string(),
    }),
  }),
  report: z.object({
    wikiEchoCount: z.number().int().nonnegative(),
    includedEchoCount: z.number().int().positive(),
    excludedEchoCount: z.number().int().nonnegative(),
    sonataCount: z.number().int().positive(),
    exactMatchedEchoCount: z.number().int().nonnegative(),
    aliasMatchedEchoCount: z.number().int().nonnegative(),
    unmatchedEchoNames: z.array(z.string()),
    provisionalEchoLocationCount: z.number().int().nonnegative(),
    routeEligibleEchoLocationCount: z.number().int().nonnegative(),
    navigationPointCount: z.number().int().nonnegative(),
    navigationPointGroupCount: z.number().int().nonnegative(),
    bossNavigationPointCount: z.number().int().nonnegative(),
    challengeNavigationPointCount: z.number().int().nonnegative(),
    navigationIconFetchFailureCount: z.number().int().nonnegative(),
    routeEligibleNavigationPointCount: z.number().int().nonnegative(),
  }),
  ...wikiCatalogueShape,
  states: z.array(z.object({
    id: z.number().int(),
    name: z.string().min(1),
    tileIds: z.array(z.string()),
    gravityTiles: z.array(z.string().regex(/^\/2\/-?\d+_-?\d+\.png$/u)).default([]).refine(
      (tiles) => new Set(tiles).size === tiles.length, { message: '反重力瓦片不能重复' },
    ),
    tileExtent: z.object({
      minTileX: z.number().int(),
      minTileY: z.number().int(),
      maxTileX: z.number().int(),
      maxTileY: z.number().int(),
      extent: z.tuple([finiteNumber, finiteNumber, finiteNumber, finiteNumber]),
    }),
    layeredMaps: z.array(z.object({
      id: z.string(),
      name: z.string(),
      coverage: z.array(floorCoverageTileSchema).default([]),
      floors: z.array(z.object({
        id: z.string(),
        name: z.string(),
        layeredMapId: z.string(),
        tiles: z.array(z.string()),
      })),
    }).superRefine((group, context) => {
      const tiles = new Set(group.floors.flatMap(({ tiles }) => tiles.map((tile) => tile.split('/').at(-1))))
      const covered = new Set<string>()
      for (const [index, entry] of group.coverage.entries()) {
        if (!tiles.has(entry.tile) || covered.has(entry.tile)) context.addIssue({
          code: 'custom', path: ['coverage', index], message: '楼层覆盖数据引用了未知或重复瓦片',
        })
        covered.add(entry.tile)
      }
      if (group.coverage.length && covered.size !== tiles.size) context.addIssue({
        code: 'custom', path: ['coverage'], message: '楼层覆盖数据遗漏瓦片',
      })
      if (group.floors.some((floor) => floor.layeredMapId !== group.id)) context.addIssue({
        code: 'custom', path: ['floors'], message: '楼层归属与所在组不一致',
      })
    })),
  })).min(1),
  mapNavigation: z.array(z.object({
    id: z.number().int(),
    name: z.string().min(1),
    regionIds: navigationRegionIdsSchema,
    groups: z.array(z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      regionIds: navigationRegionIdsSchema.min(1),
    })),
  })),
  regionLabels: z.array(regionLabelSchema),
  echoLocations: z.array(z.object({
    ...pointBaseShape,
    echoId: z.string().min(1),
  })),
  navigationPointGroups: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    iconUrl: z.string(),
    iconHash: z.string().length(64).nullable(),
    typeIds: z.array(z.string().min(1)).min(1),
    typeNames: z.array(z.string().min(1)).min(1),
    modes: z.array(z.enum(['fast-travel', 'local-transit', 'entrance', 'landmark', 'unknown'])).min(1),
    kinds: z.array(z.enum([
      'nexus',
      'beacon',
      'tacet-field',
      'training-ground',
      'hologram',
      'boss',
      'domain',
      'endgame',
      'challenge',
      'service',
      'local-transit',
      'entrance',
      'landmark',
      'unknown',
    ])).min(1),
  })),
  navigationPoints: z.array(z.object({
    ...pointBaseShape,
    groupId: z.string().min(1),
    catalogCategoryId: z.string().min(1),
    catalogCategoryName: z.string().min(1),
    mode: z.enum(['fast-travel', 'local-transit', 'entrance', 'landmark', 'unknown']),
    kind: z.enum([
      'nexus',
      'beacon',
      'tacet-field',
      'training-ground',
      'hologram',
      'boss',
      'domain',
      'endgame',
      'challenge',
      'service',
      'local-transit',
      'entrance',
      'landmark',
      'unknown',
    ]),
  })),
  connectors: z.array(z.object({
    id: z.string(),
    name: z.string(),
    stateId: z.number().int(),
    fromLevelId: z.string(),
    toLevelId: z.string(),
    from: gameCoordinateSchema,
    to: gameCoordinateSchema,
    traversalCost: z.number().nonnegative(),
    isExample: z.boolean(),
  })),
})

export const mapDatasetSchema = mapDatasetObjectSchema
  .superRefine(validateSonataEchoIds).superRefine(validateMapNavigation).superRefine(validateMapGravity)

const sourceSchema = mapDatasetObjectSchema.shape.source

export const mapDataSchema = mapDatasetObjectSchema.pick({
  version: true, states: true, mapNavigation: true, regionLabels: true, connectors: true,
}).extend({
  source: sourceSchema.omit({ wikiFetchedAt: true, sourceUrls: true }).extend({
    sourceUrls: sourceSchema.shape.sourceUrls.pick({ officialMap: true }).strict(),
  }).strict(),
}).strict().superRefine(validateMapNavigation).superRefine((map, context) => {
  validateMapGravity({ ...map, echoLocations: [], navigationPoints: [] }, context)
})

export const mapCatalogDataSchema = mapDatasetObjectSchema.pick({
  report: true, sonatas: true, echoes: true, navigationPointGroups: true,
}).extend({
  source: sourceSchema.pick({ wikiFetchedAt: true }).extend({
    sourceUrls: sourceSchema.shape.sourceUrls.pick({ echoCatalogue: true, sonataCatalogue: true }).strict(),
  }).strict(),
  pointIcons: z.array(z.object({
    id: z.string().min(1),
    typeId: pointBaseShape.typeId,
    typeName: pointBaseShape.typeName,
    iconUrl: pointBaseShape.iconUrl,
  }).strict()).refine((icons) => new Set(icons.map(({ id }) => id)).size === icons.length, { message: '点位图标 ID 不能重复' }),
}).strict().superRefine(validateSonataEchoIds)

export const mapPointLocationsSchema = z.object({
  echoLocations: z.array(mapDatasetObjectSchema.shape.echoLocations.element
    .omit({ iconUrl: true }).strict()),
  navigationPoints: z.array(mapDatasetObjectSchema.shape.navigationPoints.element
    .omit({ typeId: true, typeName: true, iconUrl: true }).extend({ iconId: z.string().min(1) }).strict()),
}).strict()

export const officialPointDataSchema = z.object({
  locations: mapPointLocationsSchema,
  library: pointLibrarySchema,
}).strict()
