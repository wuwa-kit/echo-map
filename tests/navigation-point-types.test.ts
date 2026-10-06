import { describe, expect, it } from 'vitest'
import { navigationPointTypeIds, navigationPointTypes } from '../src/domain/navigation-point-types.ts'
import { officialNavigationTypeIds, officialNavigationPointType, unclassifiedNavigationTypeIds, isOfficialNavigationType } from '../scripts/lib/map/navigation-types.ts'
import { navigationTypeIcons } from '../src/domain/navigation-icons.ts'
import { authoredPointSchema, mapDatasetSchema } from '../src/domain/schema.ts'
import { libraryLocations, parsePointLibrary } from '../src/domain/point-library.ts'
import { navigationTestDataset as referenceDataset } from './fixtures/navigation-points.ts'

describe('navigation classification', () => {
  it('maps each known official asset type ID exactly once', () => {
    const ids = [...Object.values(officialNavigationTypeIds).flat(), ...unclassifiedNavigationTypeIds]
    expect(new Set(ids).size).toBe(ids.length)
    expect(officialNavigationPointType('CS_01')).toBe('central-beacon')
    expect(officialNavigationPointType('CS_02')).toBe('small-beacon')
    expect(officialNavigationPointType('7010')).toBe('echo-settlement')
    expect(officialNavigationPointType('myjl')).toBe('echo-settlement')
    expect(officialNavigationPointType('Play_01_1')).toBe('material-domain')
    expect(officialNavigationPointType('353002')).toBe('material-domain')
    expect(officialNavigationPointType('SP_IconMonsterHead_YZ_33014_UI')).toBe('normal-boss')
    expect(officialNavigationPointType('5043')).toBe('normal-boss')
    expect(officialNavigationPointType('5021')).toBe('normal-boss')
    expect(officialNavigationPointType('5034')).toBe('normal-boss')
    expect(officialNavigationPointType('340000150')).toBe('normal-boss')
  })

  it('groups entrances and service facilities while leaving challenges and other landmarks unclassified', () => {
    expect(navigationPointTypeIds.map((id) => navigationPointTypes[id].name)).toEqual([
      '中枢信标', '小型信标', '材料副本', '无音区', '声骸聚落', '普通 BOSS',
      '周本 BOSS', '全息战略', '危行任务', '入口', '服务设施',
    ])
    for (const id of ['Play_06', 'Activity_02', 'Activity_02_1', 'Play_04', 'Play_04+1', 'SP_IconActDreamB', 'SP_IconMap_Activity_17_UI', 'SP_IconMap_Activity_21_UI', 'SP_IconMap_Activity_23_UI', 'SP_IconMap_Activity_18_UI']) {
      expect(officialNavigationPointType(id)).toBeUndefined()
      expect(isOfficialNavigationType(id)).toBe(true)
    }
    for (const id of ['FCRK', 'YMRK']) expect(officialNavigationPointType(id)).toBe('entrance')
    expect(navigationPointTypes.entrance.icons).toEqual(['icon-f9e566c56ab2c4e4'])
    for (const id of ['SP_IconMap_Shop_02_UI', 'SP_IconMap_Shop_07_UI', 'SP_IconMap_Shop_08_UI', 'SP_IconMap_Shop_06_UI', 'SP_IconMap_Shop_03_UI', 'SP_IconMap_Play_24_UI']) {
      expect(officialNavigationPointType(id)).toBe('service')
    }
    for (const id of unclassifiedNavigationTypeIds) {
      expect(officialNavigationPointType(id)).toBeUndefined()
      expect(isOfficialNavigationType(id)).toBe(true)
    }
    expect(isOfficialNavigationType('not-a-navigation-type')).toBe(false)
  })

  it('keeps settlement artwork and combines ordinary and nightmare boss icons', () => {
    expect(navigationTypeIcons('echo-settlement')).toHaveLength(3)
    expect(navigationTypeIcons('small-beacon')).toHaveLength(1)
    const ordinary = navigationTypeIcons('normal-boss')
    const nightmares = ordinary.filter(({ name }) => name.startsWith('梦魇'))
    expect(ordinary).toHaveLength(33)
    expect(navigationPointTypes['normal-boss'].name).toBe('普通 BOSS')
    expect(navigationPointTypeIds.filter((type) => navigationPointTypes[type].kind === 'boss')).toEqual(['normal-boss', 'weekly-boss'])
    expect(nightmares.length).toBeGreaterThan(0)
    expect(nightmares.every(({ name }) => name.startsWith('梦魇'))).toBe(true)
    expect(nightmares.some(({ name }) => name === '梦魇亚当·重锤')).toBe(true)
    const allBossIcons = (['normal-boss', 'weekly-boss'] as const)
      .flatMap((type) => navigationTypeIcons(type))
    expect(allBossIcons).toHaveLength(44)
    expect(new Set(allBossIcons.map(({ id }) => id)).size).toBe(allBossIcons.length)
    expect(navigationPointTypes['normal-boss']).toMatchObject({ names: [], teleportLocked: false, defaultMode: 'fast-travel' })
  })

  it('groups remnant and nightmare settlements under echo settlements with selectable artwork', () => {
    expect(navigationPointTypes['echo-settlement']).toMatchObject({ name: '声骸聚落', names: [], displayTier: 'near' })
    expect(navigationTypeIcons('echo-settlement', '残象聚落')).toHaveLength(2)
    expect(navigationTypeIcons('echo-settlement', '梦魇聚落')).toHaveLength(1)
    const points = navigationTypeIcons('echo-settlement').map((icon) => ({
      id: `settlement:${icon.id}`, kind: 'navigation', gravityType: null, stateId: 8, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name: '自定义聚落名称', pointType: 'echo-settlement', navigationKind: 'challenge', mode: 'fast-travel', iconId: icon.id,
    }))
    const library = parsePointLibrary({ version: 1, points }, referenceDataset)
    expect(library.points).toEqual(points)
    const rendered = libraryLocations(library, referenceDataset).navigationPoints
    expect(rendered.map(({ pointType }) => pointType)).toEqual(points.map(({ pointType }) => pointType))
    expect(mapDatasetSchema.safeParse({ ...referenceDataset, navigationPoints: rendered }).success).toBe(true)
  })

  it('uses one material domain type with fixed artwork and custom names for all material and training assets', () => {
    const [icon] = navigationTypeIcons('material-domain')
    if (!icon) throw new Error('需要材料副本图标')
    expect(navigationTypeIcons('material-domain')).toHaveLength(1)
    expect(officialNavigationTypeIds['material-domain']).toHaveLength(20)
    const points = icon.name.split(' / ').map((name, index) => ({
      id: `material:${index}`, kind: 'navigation', gravityType: null, stateId: 8, levelId: null,
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
      id: `hologram:${icon.id}`, kind: 'navigation', gravityType: null, stateId: 8, levelId: null,
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
      id: 'test', kind: 'navigation', gravityType: null, stateId: 8, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name: '小型信标', pointType: 'small-beacon', navigationKind: 'beacon', mode: 'fast-travel', note: '',
    }
    expect(authoredPointSchema.safeParse({ ...point, mode: 'landmark' }).success).toBe(false)
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconId: boss.id }] }, referenceDataset)).toThrow('图标与类型')
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconUrl: boss.url }] }, referenceDataset)).toThrow()
    expect(mapDatasetSchema.safeParse({ ...referenceDataset, navigationPoints: [{ ...beacon, mode: 'landmark' }] }).success).toBe(false)

  })

  it('accepts ordinary and nightmare icons under the same boss type and rejects weekly icons', () => {
    const nightmare = navigationTypeIcons('normal-boss').find(({ name }) => name.startsWith('梦魇'))
    const normal = navigationTypeIcons('normal-boss')[0]
    if (!nightmare || !normal) throw new Error('需要普通和梦魇图标')
    const point = {
      id: 'nightmare-test', kind: 'navigation', gravityType: null, stateId: 8, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name: '我记录的梦魇首领', pointType: 'normal-boss', navigationKind: 'boss', mode: 'fast-travel', note: '', iconId: nightmare.id,
    }
    const dataset = { ...referenceDataset, navigationPoints: [], navigationPointGroups: [] }
    expect(parsePointLibrary({ version: 1, points: [point] }, dataset).points[0]).toMatchObject(point)
    expect(parsePointLibrary({ version: 1, points: [{ ...point, iconId: normal.id }] }, dataset).points[0]).toMatchObject({ pointType: 'normal-boss', iconId: normal.id })
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, pointType: 'weekly-boss' }] }, dataset)).toThrow('图标与类型不符')
    expect(authoredPointSchema.safeParse({ ...point, variant: 'nightmare' }).success).toBe(false)
  })

  it.each(['normal-boss', 'tacet-field'] as const)('allows %s to save, import and render with teleport enabled or disabled', (pointType) => {
    const rule = navigationPointTypes[pointType]
    expect(rule).toMatchObject({ defaultMode: 'fast-travel', teleportLocked: false })
    for (const mode of ['landmark', 'fast-travel'] as const) {
      const points = navigationTypeIcons(pointType).map((icon) => ({
        id: `${pointType}:${icon.id}`, kind: 'navigation', gravityType: null, stateId: 8, levelId: null,
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

  it.each(['central-beacon', 'small-beacon', 'material-domain', 'echo-settlement', 'weekly-boss'] as const)('still requires teleport for %s', (pointType) => {
    const rule = navigationPointTypes[pointType]
    const point = {
      id: 'locked-test', kind: 'navigation', gravityType: null, stateId: 8, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name: rule.name, pointType, navigationKind: rule.kind, mode: 'fast-travel', note: '',
    }
    expect(authoredPointSchema.safeParse(point).success).toBe(true)
    expect(authoredPointSchema.safeParse({ ...point, mode: 'landmark' }).success).toBe(false)
  })

  it.each(['central-beacon', 'small-beacon'] as const)('rejects custom %s names while editing and saving', (pointType) => {
    const rule = navigationPointTypes[pointType]
    const source = referenceDataset.navigationPoints.find((point) => point.pointType === pointType)
    if (!source) throw new Error('需要信标数据')
    const point = {
      id: 'name-test', kind: 'navigation', gravityType: null, stateId: source.stateId, levelId: null,
      coordinate: { x: 1, y: 2, z: 0 }, name: rule.name, pointType, navigationKind: rule.kind, mode: rule.defaultMode, note: '', iconId: rule.icons[0],
    }
    expect(authoredPointSchema.safeParse(point).success).toBe(true)
    expect(parsePointLibrary({ version: 1, points: [point] }, referenceDataset, 'manual').points).toEqual([point])
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, name: '自定义信标' }] }, referenceDataset, 'manual')).toThrow('不允许自定义')
    expect(authoredPointSchema.safeParse({ ...point, name: '' }).success).toBe(false)
  })

  it.each(navigationPointTypeIds)('rejects custom icon URLs for %s even when the URL matches its catalogue', (pointType) => {
    const rule = navigationPointTypes[pointType]
    const icon = navigationTypeIcons(pointType)[0]
    if (!icon) throw new Error('需要图标')
    const point = {
      id: 'custom-url', kind: 'navigation', gravityType: null, stateId: 8, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name: rule.names[0] ?? rule.name,
      pointType, navigationKind: rule.kind, mode: rule.defaultMode, iconUrl: icon.url,
    }
    expect(() => parsePointLibrary({ version: 1, points: [point] }, referenceDataset)).toThrow()
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, pointType: undefined }] }, referenceDataset)).toThrow()
  })

  it('accepts custom names independently from the allowed icon list', () => {
    const source = navigationTypeIcons('normal-boss')[0]
    if (!source) throw new Error('需要首领数据')
    const point = {
      id: 'list-test', kind: 'navigation', gravityType: null, stateId: 8, levelId: null,
      coordinate: { x: 1, y: 2, z: 3 }, name: '自行命名的首领点', pointType: 'normal-boss', navigationKind: 'boss', mode: 'fast-travel', note: '', iconId: source.id,
    }
    expect(() => parsePointLibrary({ version: 1, points: [point] }, referenceDataset)).not.toThrow()
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, name: '未收录首领' }] }, referenceDataset)).not.toThrow()
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconId: undefined, iconUrl: 'https://example.com/custom.png' }] }, referenceDataset)).toThrow()
    const custom = { ...point, name: '自定义地标', pointType: undefined, navigationKind: 'service', mode: 'landmark', iconUrl: 'https://example.com/custom.png', iconId: undefined }
    expect(() => parsePointLibrary({ version: 1, points: [custom] }, referenceDataset)).toThrow()
    expect(navigationTypeIcons('service')).toHaveLength(20)
    expect(navigationPointTypes.entrance.icons).toHaveLength(1)
    expect(navigationPointTypes.service.names).toEqual([])
  })
})
