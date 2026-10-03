import { navigationPointTypes } from '../../src/domain/navigation-point-types.ts'
import { navigationTypeIcons } from '../../src/domain/navigation-icons.ts'
import type { NavigationPoint, NavigationPointType } from '../../src/domain/types.ts'
import { officialToMapCoordinate } from '../../src/map/projection.ts'
import { referenceDataset } from './point-library.ts'

export function navigationPoint(pointType: NavigationPointType = 'small-beacon', name?: string): NavigationPoint {
  const rule = navigationPointTypes[pointType]
  return {
    id: `test:${pointType}`, typeId: `test:${pointType}`, typeName: name ?? rule.name,
    pointType, kind: rule.kind, mode: rule.defaultMode, iconUrl: navigationTypeIcons(pointType)[0]?.url ?? '',
    groupId: `test:${rule.kind}`, catalogCategoryId: 'test', catalogCategoryName: '测试定位点',
    stateId: 8, countryId: null, layeredMapId: null, levelId: null, gravityType: null,
    coordinate: officialToMapCoordinate(100, 200), gameCoordinate: { x: 1, y: 2, z: 3 }, quality: 'manual-verified',
  }
}

export const navigationTestDataset = {
  ...referenceDataset,
  navigationPoints: [
    navigationPoint(), navigationPoint('central-beacon'),
    navigationPoint('normal-boss', '测试首领'), navigationPoint('weekly-boss', '星海迷途之扉'),
  ],
}
