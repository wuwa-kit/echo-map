import { createHash } from 'node:crypto'
import type { WikiSnapshot } from '../../scripts/lib/wiki.ts'

export const iconBytes = new Uint8Array([1, 2, 3])
export const iconHash = createHash('sha256').update(iconBytes).digest('hex')
export const wiki: WikiSnapshot = {
  fetchedAt: '2026-01-01T00:00:00.000Z', totalEchoCount: 4, excludedEchoNames: ['排除的 BOSS'],
  sonatas: [{ id: 'sonata', name: '合鸣', iconUrl: '', sourceId: 1, c1EchoIds: ['echo-0', 'echo-1', 'echo-2'], c3EchoIds: [] }],
  echoes: ['甲', '乙', '丙'].map((name, index) => ({
    id: `echo-${index}`, name, iconUrl: '', sonataIds: ['sonata'], cost: 1, sourceId: index,
  })),
}

const coordinate = { stateId: 8, countryId: 1, levelId: null, x: 11, y: 22, z: 33, quality: 'manual-verified', note: '固定测试输入' }
export const manual = {
  echoLocations: [
    { ...coordinate, id: 'manual-linked', officialLocationId: 'echo-official', echoName: '甲' },
    { ...coordinate, id: 'manual-independent', echoName: '甲' },
    { ...coordinate, id: 'manual-orphan', officialLocationId: 'missing-official', echoName: '乙' },
  ],
  navigationPoints: [{ ...coordinate, id: 'manual-navigation', officialLocationId: 'nav-1' }],
  connectors: [{
    id: 'stairs', name: '楼梯', stateId: 8, fromLevelId: 'floor-1', toLevelId: 'floor-2',
    from: { x: 1, y: 2, z: 3 }, to: { x: 4, y: 5, z: 6 }, traversalCost: 5, isExample: false,
  }],
}

export const navigationConfig = {
  includeTableNames: { challenge: { mode: 'fast-travel', kind: 'challenge' } },
  types: {
    '10': { mode: 'fast-travel', kind: 'beacon' },
    '11': { mode: 'landmark', kind: 'service' },
    '12': { mode: 'entrance', kind: 'entrance' },
    '20': { mode: 'fast-travel', kind: 'boss' },
  },
}

const location = (id: string) => ({ id, stateId: 8, countryId: 1, floorId: '0', level: '', x: 100, y: 200 })
export const positions = [
  { id: '1', name: '  甲  ', icon: 'echo.png', location: [location('echo-official')] },
  { id: '2', name: '官方别名', icon: '', location: [{ ...location('echo-alias'), floorId: 'layer', level: 'floor-1' }] },
  { id: '3', name: '未知怪物', icon: '', location: [location('excluded')] },
  { id: '10', name: '信标', icon: 'same-a.png', location: [location('nav-1')] },
  { id: '11', name: '服务', icon: 'same-b.png', location: [location('nav-2')] },
  { id: '12', name: '入口', icon: 'failed.png', location: [location('nav-3')] },
  { id: '20', name: 'BOSS', icon: 'boss.png', location: [location('boss')] },
  { id: '21', name: '挑战', icon: '', location: [location('challenge')] },
]

export const catalog = [{
  id: 'category', name: '挑战', children: [{ id: '21', tableName: 'challenge' }],
}]

export const layers = [{
  id: 'layer', name: '分层地图', floors: [{ id: 'floor-1', name: '一层', tiles: ['8/0_1.png'] }],
}]

export const countries = [{
  name: '地区', stateId: 8, countryId: 1, xPosition: 100, yPosition: 200,
  children: [{ name: '地名', xPosition: 300, yPosition: 400 }],
}]
