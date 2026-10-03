import { describe, expect, it } from 'vitest'
import { navigationPointTypeIds, navigationPointTypes } from '../src/domain/navigation-point-types.ts'
import { officialNavigationTypeIds, officialNavigationPointType } from '../scripts/lib/map/navigation-types.ts'
import { navigationTypeIcons } from '../src/domain/navigation-icons.ts'
import { authoredPointSchema, mapDatasetSchema } from '../src/domain/schema.ts'
import { libraryLocations, parsePointLibrary } from '../src/domain/point-library.ts'
import { navigationTestDataset as referenceDataset } from './fixtures/navigation-points.ts'

describe('navigation classification', () => {
  it('maps each known official asset type ID exactly once', () => {
    const ids = Object.values(officialNavigationTypeIds).flat()
    expect(new Set(ids).size).toBe(ids.length)
    expect(officialNavigationPointType('CS_01')).toBe('central-beacon')
    expect(officialNavigationPointType('CS_02')).toBe('small-beacon')
    expect(officialNavigationPointType('7010')).toBe('remnant-settlement')
    expect(officialNavigationPointType('myjl')).toBe('nightmare-settlement')
    expect(officialNavigationPointType('Play_01_1')).toBe('material-domain')
    expect(officialNavigationPointType('353002')).toBe('material-domain')
    expect(officialNavigationPointType('SP_IconMonsterHead_YZ_33014_UI')).toBe('nightmare-boss')
    expect(officialNavigationPointType('5043')).toBe('nightmare-boss')
    expect(officialNavigationPointType('5021')).toBe('normal-boss')
    expect(officialNavigationPointType('5034')).toBe('normal-boss')
    expect(officialNavigationPointType('340000150')).toBe('normal-boss')
  })

  it('keeps settlement artwork and gives nightmare bosses an independent icon list', () => {
    expect(navigationTypeIcons('remnant-settlement')).toHaveLength(2)
    expect(navigationTypeIcons('small-beacon')).toHaveLength(1)
    const ordinary = navigationTypeIcons('normal-boss')
    const nightmares = navigationTypeIcons('nightmare-boss')
    expect(ordinary).toHaveLength(22)
    expect(navigationPointTypes['normal-boss'].name).toBe('普通 BOSS')
    expect(navigationPointTypeIds.filter((type) => navigationPointTypes[type].kind === 'boss')).toEqual(['normal-boss', 'nightmare-boss', 'weekly-boss'])
    expect(nightmares.length).toBeGreaterThan(0)
    expect(nightmares.every(({ name }) => name.startsWith('梦魇'))).toBe(true)
    expect(nightmares.some(({ name }) => name === '梦魇亚当·重锤')).toBe(true)
    const allBossIcons = (['normal-boss', 'weekly-boss', 'nightmare-boss'] as const)
      .flatMap((type) => navigationTypeIcons(type))
    expect(allBossIcons).toHaveLength(44)
    expect(new Set(allBossIcons.map(({ id }) => id)).size).toBe(allBossIcons.length)
    expect(navigationPointTypes['nightmare-boss']).toMatchObject({ names: [], teleportLocked: false, defaultMode: 'fast-travel' })
  })

  it('uses one material domain type with fixed artwork and custom names for all material and training assets', () => {
    const [icon] = navigationTypeIcons('material-domain')
    if (!icon) throw new Error('需要材料副本图标')
    expect(navigationTypeIcons('material-domain')).toHaveLength(1)
    expect(officialNavigationTypeIds['material-domain']).toHaveLength(20)
    const points = icon.name.split(' / ').map((name, index) => ({
      id: `material:${index}`, kind: 'navigation', status: 'verified', gravityType: null, stateId: 8, countryId: null, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name, pointType: 'material-domain', navigationKind: 'domain', mode: 'fast-travel', note: '', iconId: icon.id,
    }))
    expect(parsePointLibrary({ version: 1, points }, referenceDataset).points).toEqual(points)
    expect(navigationPointTypes['material-domain'].names).toEqual([])
  })

  it('groups all hologram artwork under one type with optional teleport', () => {
    expect(navigationPointTypeIds.filter((type) => navigationPointTypes[type].kind === 'hologram')).toEqual(['hologram'])
    expect(navigationTypeIcons('hologram').map(({ name }) => name)).toEqual(['全息战略', '全息战略·同步', '全息战略·演武', '全息战略·刀伶之舞'])
    expect(navigationPointTypes.hologram).toMatchObject({ defaultMode: 'landmark', teleportLocked: false, names: [] })
    for (const id of ['Play_10', '4027', '4028', 'qxzl·dlzw']) expect(officialNavigationPointType(id)).toBe('hologram')
  })

  it.each(['landmark', 'fast-travel'] as const)('accepts each hologram icon in %s mode when saving, importing and rendering', (mode) => {
    const points = navigationTypeIcons('hologram').map((icon) => ({
      id: `hologram:${icon.id}`, kind: 'navigation', status: 'verified', gravityType: null, stateId: 8, countryId: null, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name: icon.name, pointType: 'hologram', navigationKind: 'hologram', mode, note: '', iconId: icon.id,
    }))
    const library = parsePointLibrary({ version: 1, points }, referenceDataset)
    expect(library.points).toEqual(points)
    const rendered = libraryLocations(library, referenceDataset).navigationPoints
    expect(rendered.map(({ mode }) => mode)).toEqual(points.map(({ mode }) => mode))
    expect(mapDatasetSchema.safeParse({ ...referenceDataset, navigationPoints: rendered }).success).toBe(true)
  })

  it('rejects imported or saved type, travel and icon contradictions', () => {
    const beacon = referenceDataset.navigationPoints.find(({ pointType }) => pointType === 'small-beacon')
    const boss = navigationTypeIcons('weekly-boss')[0]
    if (!beacon || !boss) throw new Error('需要信标和首领')
    const point = {
      id: 'test', kind: 'navigation', status: 'verified', gravityType: null, stateId: 8, countryId: null, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name: '小型信标', pointType: 'small-beacon', navigationKind: 'beacon', mode: 'fast-travel', note: '',
    }
    expect(authoredPointSchema.safeParse({ ...point, mode: 'landmark' }).success).toBe(false)
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconId: boss.id }] }, referenceDataset)).toThrow('图标与类型')
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconUrl: boss.url }] }, referenceDataset)).toThrow('图标不属于')
    expect(mapDatasetSchema.safeParse({ ...referenceDataset, navigationPoints: [{ ...beacon, mode: 'landmark' }] }).success).toBe(false)

  })

  it('validates nightmare bosses by type and rejects normal icons', () => {
    const nightmare = navigationTypeIcons('nightmare-boss')[0]
    const normal = navigationTypeIcons('normal-boss')[0]
    if (!nightmare || !normal) throw new Error('需要普通和梦魇图标')
    const point = {
      id: 'nightmare-test', kind: 'navigation', status: 'verified', gravityType: null, stateId: 8, countryId: null, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name: '我记录的梦魇首领', pointType: 'nightmare-boss', navigationKind: 'boss', mode: 'fast-travel', note: '', iconId: nightmare.id,
    }
    const dataset = { ...referenceDataset, navigationPoints: [], navigationPointGroups: [] }
    expect(parsePointLibrary({ version: 1, points: [point] }, dataset).points[0]).toMatchObject(point)
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconId: normal.id }] }, dataset)).toThrow('图标与类型不符')
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, pointType: 'normal-boss' }] }, dataset)).toThrow('图标与类型不符')
    expect(authoredPointSchema.safeParse({ ...point, variant: 'nightmare' }).success).toBe(false)
  })

  it.each(['normal-boss', 'nightmare-boss', 'tacet-field'] as const)('allows %s to save, import and render with teleport enabled or disabled', (pointType) => {
    const rule = navigationPointTypes[pointType]
    expect(rule).toMatchObject({ defaultMode: 'fast-travel', teleportLocked: false })
    for (const mode of ['landmark', 'fast-travel'] as const) {
      const points = navigationTypeIcons(pointType).map((icon) => ({
        id: `${pointType}:${icon.id}`, kind: 'navigation', status: 'verified', gravityType: null, stateId: 8, countryId: null, levelId: null,
        coordinate: { x: 1, y: 2, z: 3 }, name: rule.names[0] ?? icon.name, pointType, navigationKind: rule.kind, mode, note: '', iconId: icon.id,
      }))
      const library = parsePointLibrary({ version: 1, points }, referenceDataset)
      expect(library.points).toEqual(points)
      const rendered = libraryLocations(library, referenceDataset).navigationPoints
      expect(rendered.map(({ mode }) => mode)).toEqual(points.map(({ mode }) => mode))
      expect(mapDatasetSchema.safeParse({ ...referenceDataset, navigationPoints: rendered }).success).toBe(true)
      expect(authoredPointSchema.safeParse({ ...points[0], mode: 'local-transit' }).success).toBe(false)
      expect(authoredPointSchema.safeParse({ ...points[0], mode: 'entrance' }).success).toBe(false)
    }
  })

  it.each(['central-beacon', 'small-beacon', 'material-domain', 'remnant-settlement', 'nightmare-settlement', 'weekly-boss', 'tower-of-adversity', 'challenge'] as const)('still requires teleport for %s', (pointType) => {
    const rule = navigationPointTypes[pointType]
    const point = {
      id: 'locked-test', kind: 'navigation', status: 'verified', gravityType: null, stateId: 8, countryId: null, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name: rule.name, pointType, navigationKind: rule.kind, mode: 'fast-travel', note: '',
    }
    expect(authoredPointSchema.safeParse(point).success).toBe(true)
    expect(authoredPointSchema.safeParse({ ...point, mode: 'landmark' }).success).toBe(false)
  })

  it.each(['central-beacon', 'small-beacon'] as const)('rejects custom %s names in drafts, saved points and official imports', (pointType) => {
    const rule = navigationPointTypes[pointType]
    const source = referenceDataset.navigationPoints.find((point) => point.pointType === pointType)
    if (!source) throw new Error('需要信标数据')
    for (const status of ['draft', 'verified', 'imported'] as const) {
      const point = {
        id: 'name-test', kind: 'navigation', status, gravityType: null, stateId: source.stateId, countryId: null, levelId: null,
        officialIds: status === 'imported' ? [source.id] : undefined,
        coordinate: { x: 1, y: 2, z: 0 }, name: rule.name, pointType, navigationKind: rule.kind, mode: rule.defaultMode, note: '',
      }
      expect(authoredPointSchema.safeParse(point).success).toBe(true)
      expect(() => parsePointLibrary({ version: 1, points: [{ ...point, name: '自定义信标' }] }, referenceDataset, status === 'imported' ? 'official' : 'manual')).toThrow('不允许自定义')
      expect(authoredPointSchema.safeParse({ ...point, name: '' }).success).toBe(false)
    }
  })

  it('accepts custom names independently from the allowed icon list', () => {
    const source = navigationTypeIcons('normal-boss')[0]
    if (!source) throw new Error('需要首领数据')
    const point = {
      id: 'list-test', kind: 'navigation', status: 'verified', gravityType: null, stateId: 8, countryId: null, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name: '自行命名的首领点', pointType: 'normal-boss', navigationKind: 'boss', mode: 'fast-travel', note: '', iconId: source.id,
    }
    expect(() => parsePointLibrary({ version: 1, points: [point] }, referenceDataset)).not.toThrow()
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, name: '未收录首领' }] }, referenceDataset)).not.toThrow()
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconId: undefined, iconUrl: 'https://example.com/custom.png' }] }, referenceDataset)).toThrow('图标不属于')
    const custom = { ...point, name: '自定义地标', pointType: 'service', navigationKind: 'service', mode: 'landmark', iconUrl: 'https://example.com/custom.png', iconId: undefined }
    expect(parsePointLibrary({ version: 1, points: [custom] }, referenceDataset).points[0]).toMatchObject({ name: custom.name, iconUrl: custom.iconUrl })
    expect(navigationTypeIcons('service').length).toBeGreaterThan(navigationTypeIcons('normal-boss').length)
    expect(navigationPointTypes.restaurant.icons).toHaveLength(1)
    expect(navigationPointTypes.restaurant.names).toEqual([])
  })
})
