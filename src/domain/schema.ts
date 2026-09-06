import { z } from 'zod'

const finiteNumber = z.number().finite()
const nullableString = z.string().nullable()

export const navigationKindSchema = z.enum([
  'nexus', 'beacon', 'tacet-field', 'training-ground', 'hologram', 'boss', 'domain',
  'endgame', 'challenge', 'service', 'local-transit', 'entrance', 'landmark', 'unknown',
])
export const navigationModeSchema = z.enum(['fast-travel', 'local-transit', 'entrance', 'landmark', 'unknown'])

const authoredPointBase = {
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

const pointBaseShape = {
  id: z.string().min(1),
  typeId: z.string().min(1),
  typeName: z.string().min(1),
  iconUrl: z.string(),
  stateId: z.number().int(),
  countryId: z.number().int().nullable(),
  layeredMapId: nullableString,
  levelId: nullableString,
  coordinate: officialCoordinateSchema,
  gameCoordinate: gameCoordinateSchema.nullable(),
  quality: z.enum(['official-provisional', 'manual-verified', 'example']),
}

export const mapDatasetSchema = z.object({
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
  sonatas: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    iconUrl: z.string(),
    sourceId: z.number().int(),
  })).min(1),
  echoes: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    iconUrl: z.string(),
    sonataIds: z.tuple([z.string().min(1)]).rest(z.string().min(1)),
    cost: z.union([z.literal(1), z.literal(3)]),
    sourceId: z.number().int(),
  })).min(1),
  states: z.array(z.object({
    id: z.number().int(),
    name: z.string().min(1),
    tileIds: z.array(z.string()),
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
      floors: z.array(z.object({
        id: z.string(),
        name: z.string(),
        layeredMapId: z.string(),
        tiles: z.array(z.string()),
      })),
    })),
  })).min(1),
  regionLabels: z.array(z.object({
    id: z.string(),
    name: z.string(),
    stateId: z.number().int(),
    countryId: z.number().int(),
    level: z.number().int(),
    coordinate: officialCoordinateSchema,
  })),
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
