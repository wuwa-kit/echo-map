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
  ])('uses clipped corners for the weekly boss %s', (typeName) => {
    expect(bossMarkerShape({ kind: 'boss', typeName })).toBe('cut-diamond')
  })

  it.each([
    '无归的谬误',
    '云闪之鳞',
    '海之女',
    '梦魇·飞廉之猩',
    '梦魇·昔日咏叹之钟',
    '昔日咏叹之钟·挑战',
    '',
  ])('keeps the full diamond when the whole name does not match: %s', (typeName) => {
    expect(bossMarkerShape({ kind: 'boss', typeName })).toBe('diamond')
  })

  it('leaves matching service landmarks and ordinary challenges unframed', () => {
    expect(bossMarkerShape({ kind: 'service', typeName: '青实归还之碑' })).toBeNull()
    expect(bossMarkerShape({ kind: 'challenge', typeName: '昔日咏叹之钟' })).toBeNull()
    expect(bossMarkerShape({ kind: 'domain', typeName: '欲燃之森' })).toBeNull()
  })
})
