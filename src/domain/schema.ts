import { z } from 'zod'
import { navigationPointTypeIds, navigationPointTypes, navigationTypeErrors } from './navigation-point-types.ts'
import { navigationIconById, navigationTypeIcons } from './navigation-icons.ts'
import type { RefinementCtx } from 'zod'
import type { MapDataset, NavigationKind, NavigationMode, NavigationPointType } from './types.ts'

const finiteNumber = z.number().finite()
const nullableString = z.string().nullable().default(null)
export const gravityTypeSchema = z.union([z.literal(1), z.literal(2)])

export const officialAssetCategorySchema = z.enum(['echo', 'sonata', 'navigation', 'exploration', 'challenge', 'service', 'tile', 'floor', 'gravity'])
const assetUrlSchema = z.string().url().startsWith('https://')
export const navigationIconUrlSchema = z.url({ protocol: /^https$/u })
export const navigationIconDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: navigationIconUrlSchema,
}).strict()
export const officialAssetSchema = z.object({
  id: z.string().min(1),
  category: officialAssetCategorySchema,
  categories: z.array(officialAssetCategorySchema).min(1),
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

export const officialMapAssetCatalogSchema = z.object({
  version: z.literal(1),
  resourceHash: z.string().min(1),
  assets: z.array(officialAssetSchema).min(1),
}).strict().superRefine(({ assets }, context) => {
  const ids = new Set<string>()
  for (const asset of assets) {
    if (!asset.categories.includes(asset.category) || asset.categories.some((category) => !['navigation', 'exploration', 'challenge', 'service'].includes(category))) context.addIssue({ code: 'custom', message: '地图目录包含未收录分类' })
    if (ids.has(asset.id)) context.addIssue({ code: 'custom', message: `重复地图目录资产：${asset.id}` })
    ids.add(asset.id)
  }
  for (const category of ['exploration', 'challenge', 'service']) {
    if (!assets.some((asset) => asset.categories.some((value) => value === category))) context.addIssue({ code: 'custom', message: `地图目录缺少 ${category}` })
  }
})

export const navigationKindSchema = z.enum([
  'nexus', 'beacon', 'tacet-field', 'training-ground', 'hologram', 'boss', 'domain',
  'endgame', 'challenge', 'service', 'local-transit', 'entrance', 'landmark', 'unknown',
])
export const navigationPointTypeSchema = z.enum(navigationPointTypeIds)
export const navigationModeSchema = z.enum(['fast-travel', 'local-transit', 'entrance', 'landmark', 'unknown'])

const authoredCoordinateSchema = z.object({
  x: z.number().int().safe().nullable().default(null),
  y: z.number().int().safe().nullable().default(null),
  z: z.number().int().safe().nullable().default(null),
}).strict()

const authoredPointBase = {
  gravityType: gravityTypeSchema.nullable().default(null),
  id: z.string().min(1).max(100),
  officialIds: z.array(z.string().min(1).max(100)).min(1).optional(),
  replacesOfficialIds: z.array(z.string().min(1).max(100)).min(1).optional(),
  stateId: z.number().int(),
  levelId: z.string().min(1).nullable().default(null),
  coordinate: authoredCoordinateSchema,
  note: z.string().max(2000).optional(),
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
    pointType: navigationPointTypeSchema.optional(),
    iconId: z.string().min(1).optional(),
    iconUrl: navigationIconUrlSchema.optional(),
    mode: navigationModeSchema,
    teleportCoordinate: authoredCoordinateSchema.optional(),
  }).strict(),
]).superRefine((point, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message })
  if (point.kind === 'echo' && new Set(point.members.map(({ echoId }) => echoId)).size !== point.members.length) {
    issue('同种怪物只能有一行，请合并数量')
  }
  if (point.officialIds && point.coordinate.z !== 0) {
    issue('官方导入点的 Z 固定为 0')
  }
  if (point.kind === 'navigation') {
    for (const message of navigationTypeErrors({ ...point, kind: point.navigationKind })) issue(message)
    const rule = point.pointType ? navigationPointTypes[point.pointType] : undefined
    const fixedName = rule?.names[0]
    if (fixedName !== undefined && point.name !== fixedName) issue(`名称固定为“${fixedName}”，不允许自定义`)
    if (point.iconId && !navigationIconById(point.iconId)) issue('定位点引用了未知图标')
    if (point.iconId && point.iconUrl) issue('图标 ID 与自定义图标地址不能同时设置')
    if (point.pointType && rule?.icons.length) {
      const icons = navigationTypeIcons(point.pointType)
      if (point.iconId && !icons.some(({ id }) => id === point.iconId)) issue('图标与类型不符')
      if (point.iconUrl && !icons.some(({ url }) => url === point.iconUrl)) issue('图标不属于所选类型')
    }
  }
  if (point.kind === 'navigation' && point.teleportCoordinate && point.mode !== 'fast-travel') {
    issue('只有可直接传送的定位点可以填写传送落点')
  }
})

export const savedPointSchema = authoredPointSchema.superRefine((point, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message })
  if (Object.values(point.coordinate).some((value) => value === null)) issue('点位必须填写完整的整数 XYZ')
  if (point.kind === 'echo' && point.members.length === 0) issue('刷取点至少需要一种怪物')
  if (point.kind === 'navigation') {
    if (!point.name.trim() || point.navigationKind === 'unknown' || point.mode === 'unknown') issue('定位点需要名称和明确的传送能力')
    if (!point.iconId && !point.iconUrl) issue('定位点需要图标')
    if (point.teleportCoordinate && Object.values(point.teleportCoordinate).some((value) => value === null)) issue('传送落点必须填写完整的整数 XYZ')
  }
})

export const pointLibrarySchema = z.object({
  version: z.literal(1),
  points: z.array(savedPointSchema).max(100000),
}).strict().superRefine(({ points }, context) => {
  const ids = new Set<string>()
  for (const point of points) {
    if (ids.has(point.id)) context.addIssue({ code: 'custom', message: `重复点位 ID：${point.id}` })
    ids.add(point.id)
  }
})

export const echoPointLibrarySchema = pointLibrarySchema.superRefine(({ points }, context) => {
  if (points.some(({ kind }) => kind !== 'echo')) context.addIssue({ code: 'custom', message: '声骸点位文件不能包含定位点' })
})

export const navigationPointLibrarySchema = pointLibrarySchema.superRefine(({ points }, context) => {
  if (points.some(({ kind }) => kind !== 'navigation')) context.addIssue({ code: 'custom', message: '定位点文件不能包含声骸点位' })
})

export const localPointChangeSchema = z.object({
  id: z.string().min(1).max(100),
  before: savedPointSchema.nullable().default(null),
  after: savedPointSchema.nullable().default(null),
  needsReview: z.boolean(),
}).strict().superRefine((change, context) => {
  if ((!change.before && !change.after) || [change.before, change.after].some(point => point && point.id !== change.id)) {
    context.addIssue({ code: 'custom', message: '修改记录必须保留相同的点位 ID' })
  }
  if (change.before && change.after && change.before.kind !== change.after.kind) context.addIssue({ code: 'custom', message: '同一条记录不能改变点位类别' })
})

const localPointChangesSchema = z.array(localPointChangeSchema).max(100000).superRefine((changes, context) => {
  if (new Set(changes.map(({ id }) => id)).size !== changes.length) context.addIssue({ code: 'custom', message: '修改记录的点位 ID 重复' })
})

export const pointWorkspaceSchema = z.object({
  version: z.literal(1),
  published: pointLibrarySchema,
  changes: localPointChangesSchema,
}).strict()

export const pointTransferSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('point-changes'), version: z.literal(1), exportedAt: z.iso.datetime(), changes: localPointChangesSchema }).strict(),
  z.object({ format: z.literal('point-backup'), version: z.literal(1), exportedAt: z.iso.datetime(), workspace: pointWorkspaceSchema }).strict(),
])

export const gameCoordinateSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  z: finiteNumber,
})

const teleportCoordinateSchema = z.object({
  x: z.number().int().safe(),
  y: z.number().int().safe(),
  z: z.number().int().safe(),
}).strict()

const officialCoordinateSchema = z.object({
  rawX: finiteNumber,
  rawY: finiteNumber,
  mapX: finiteNumber,
  mapY: finiteNumber,
})

const mapLocationBaseShape = {
  id: z.string().min(1),
  stateId: z.number().int(),
  countryId: z.number().int().nullable().default(null),
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
  maxZoom: finiteNumber.nullable().default(null),
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
  gameCoordinate: gameCoordinateSchema.nullable().default(null),
  quality: z.enum(['official-provisional', 'manual', 'example']),
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

function validateNavigationTeleportCoordinates(
  dataset: { navigationPoints: readonly { pointType?: NavigationPointType, kind: NavigationKind, mode: NavigationMode, teleportCoordinate?: unknown }[] },
  context: RefinementCtx,
  path: 'navigationPoints' | 'locations' = 'navigationPoints',
): void {
  dataset.navigationPoints.forEach((point, index) => {
    for (const message of navigationTypeErrors(point)) context.addIssue({ code: 'custom', path: [path, index], message })
    if (point.teleportCoordinate && point.mode !== 'fast-travel') context.addIssue({
      code: 'custom', path: [path, index, 'teleportCoordinate'], message: '只有可直接传送的定位点可以填写传送落点',
    })
  })
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
    iconHash: z.string().length(64).nullable().default(null),
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
    pointType: navigationPointTypeSchema.optional(),
    teleportCoordinate: teleportCoordinateSchema.optional(),
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
  .superRefine(validateSonataEchoIds).superRefine(validateMapNavigation).superRefine(validateMapGravity).superRefine(validateNavigationTeleportCoordinates)

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
  report: true, sonatas: true, echoes: true,
}).extend({
  source: sourceSchema.pick({ wikiFetchedAt: true }).extend({
    sourceUrls: sourceSchema.shape.sourceUrls.pick({ echoCatalogue: true, sonataCatalogue: true }).strict(),
  }).strict(),
}).strict().superRefine(validateSonataEchoIds)

export const mapEchoLocationsSchema = z.array(mapDatasetObjectSchema.shape.echoLocations.element
  .omit({ iconUrl: true }).strict())

export const mapPointLocationsSchema = z.object({
  echoLocations: mapEchoLocationsSchema,
}).strict()

export const officialEchoPointDataSchema = z.object({
  locations: mapEchoLocationsSchema,
  library: echoPointLibrarySchema,
}).strict()
