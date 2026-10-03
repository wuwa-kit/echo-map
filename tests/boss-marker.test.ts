import { describe, expect, it } from 'vitest'
import { bossMarkerShape } from '../src/map/boss-marker.ts'

describe('boss marker classification', () => {
  it.each([
    '星海迷途之扉',
    '虚妄诞生之种',
    '失坠困咎之庭',
    '无序边境之火',
    '无冠巨象之心',
    '时序命定之争',
    '彼世猩红之幕',
    '命途断章之轮',
    '烬夜天启之章',
    '昔日咏叹之钟',
    '周本 BOSS',
    '我命名的周本',
    '',
  ])('uses clipped corners for the weekly boss %s', (typeName) => {
    const point = { kind: 'boss', pointType: 'weekly-boss', typeName } as const
    expect(bossMarkerShape(point)).toBe('cut-diamond')
  })

  it.each([
    '无归的谬误',
    '云闪之鳞',
    '海之女',
    '梦魇·飞廉之猩',
    '梦魇·昔日咏叹之钟',
    '昔日咏叹之钟·挑战',
    '',
    '星海迷途之扉',
  ])('keeps a normal boss diamond independently of its name: %s', (typeName) => {
    const point = { kind: 'boss', pointType: 'normal-boss', typeName } as const
    expect(bossMarkerShape(point)).toBe('diamond')
  })

  it.each(['nightmare-boss', 'normal-boss', undefined] as const)('does not infer a weekly frame from the name for %s', (pointType) => {
    const point = { kind: 'boss', pointType, typeName: '昔日咏叹之钟' } as const
    expect(bossMarkerShape(point)).toBe('diamond')
  })

  it('leaves service landmarks and ordinary challenges unframed', () => {
    expect(bossMarkerShape({ kind: 'service', pointType: 'service' })).toBeNull()
    expect(bossMarkerShape({ kind: 'challenge', pointType: 'challenge' })).toBeNull()
    expect(bossMarkerShape({ kind: 'domain', pointType: 'material-domain' })).toBeNull()
  })
})
