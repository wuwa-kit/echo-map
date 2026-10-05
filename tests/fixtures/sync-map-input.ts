import { PNG } from 'pngjs'
import type { WikiSnapshot } from '../../scripts/lib/wiki.ts'

export const iconBytes = PNG.sync.write(new PNG({ width: 1, height: 1 }))
export const wiki: WikiSnapshot = {
  fetchedAt: '2026-01-01T00:00:00.000Z', totalEchoCount: 4, excludedEchoNames: ['排除的 BOSS'],
  sonatas: [{ id: 'sonata', name: '合鸣', iconUrl: '', sourceId: 1, c1EchoIds: ['echo-0', 'echo-1', 'echo-2'], c3EchoIds: [] }],
  echoes: ['甲', '乙', '丙'].map((name, index) => ({
    id: `echo-${index}`, name, iconUrl: '', sonataIds: ['sonata'], cost: 1, sourceId: index,
  })),
}

const coordinate = { stateId: 8, countryId: 1, levelId: null, x: 11, y: 22, z: 33, quality: 'manual', note: '固定测试输入' }
export const manual = {
  echoLocations: [
    { ...coordinate, id: 'manual-linked', officialLocationId: 'echo-official', echoName: '甲' },
    { ...coordinate, id: 'manual-independent', echoName: '甲' },
    { ...coordinate, id: 'manual-orphan', officialLocationId: 'missing-official', echoName: '乙' },
  ],
  connectors: [{
    id: 'stairs', name: '楼梯', stateId: 8, fromLevelId: 'floor-1', toLevelId: 'floor-2',
    from: { x: 1, y: 2, z: 3 }, to: { x: 4, y: 5, z: 6 }, traversalCost: 5, isExample: false,
  }],
}

export const navigationConfig = {
  includeTableNames: { challenge: 'challenge' },
  types: {
    CS_02: 'small-beacon',
    '11': 'service',
    FCRK: 'entrance',
    '5034': 'normal-boss',
  },
}

const location = (id: string) => ({ id, stateId: 8, countryId: 1, floorId: '0', level: '', x: 100, y: 200 })
export const positions = [
  { id: '1', name: '  甲  ', icon: 'echo.png', location: [location('echo-official')] },
  { id: '2', name: '官方别名', icon: '', location: [{ ...location('echo-alias'), floorId: 'layer', level: 'floor-1' }] },
  { id: '3', name: '未知怪物', icon: '', location: [location('excluded')] },
  { id: 'CS_02', name: '小型信标', icon: 'same-a.png', location: [location('nav-1')] },
  { id: '11', name: '服务', icon: 'same-b.png', location: [location('nav-2')] },
  { id: 'FCRK', name: '分层入口', icon: 'failed.png', location: [location('nav-3')] },
  { id: '5034', name: '罗蕾莱', icon: 'boss.png', location: [location('boss')] },
  { id: '21', name: '挑战', icon: '', location: [location('challenge')] },
]

export const catalog = [{
  id: 'category', name: '挑战', children: [{ id: '21', name: '挑战', icon: 'icons/challenge.png', tableName: 'challenge' }],
}, {
  id: 'ts', name: '探索', children: [
    { id: 'exploration-fixture', name: '探索', icon: 'icons/exploration.png' },
    { id: 'CS_02', name: '小型信标', icon: 'same-a.png' },
  ],
}, {
  id: '9', name: 'NPC及服务点', children: [{ id: 'service-fixture', name: '服务点', icon: 'icons/service.png' }],
}, {
  id: '10', name: 'BOSS', children: [{ id: '5034', name: '罗蕾莱', icon: 'boss.png' }],
}]

export const layers = [{
  id: 'layer', name: '分层地图', floors: [{ id: 'floor-1', name: '一层', tiles: ['8/0_1.png'] }],
}]

export const countries = [{
  name: '地区', stateId: 8, countryId: 1, mapStateId: '1', mapStateName: '今州', xPosition: 100, yPosition: 200,
  children: [{ name: '地名', mapState: '1', xPosition: 300, yPosition: 400 }],
}]
