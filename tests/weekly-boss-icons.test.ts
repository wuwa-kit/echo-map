import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { navigationPointLibrarySchema } from '../src/domain/schema.ts'
import { navigationPointTypes } from '../src/domain/navigation-point-types.ts'
import { navigationIconById } from '../src/domain/navigation-icons.ts'

const expected = [
  ['昔日咏叹之钟', 'map-boss-11102'],
  ['无冠巨象之心', 'map-boss-11101'],
  ['时序命定之争', 'map-boss-14256'],
  ['无序边境之火', 'map-boss-scar'],
  ['彼世猩红之幕', 'map-boss-15679'],
  ['命途断章之轮', 'map-boss-16362'],
  ['烬夜天启之章', 'map-boss-17973'],
  ['星海迷途之扉', 'map-boss-19915'],
  ['虚妄诞生之种', 'map-boss-21259'],
  ['失坠困咎之庭', 'map-boss-22794'],
  ['定序诸理之律', 'map-boss-24196'],
] as const

describe('authored weekly boss artwork', () => {
  it('uses map IDs for every weekly boss icon', () => {
    expect(navigationPointTypes['weekly-boss'].icons.every(id => id.startsWith('map-boss-'))).toBe(true)
  })
  const points = readdirSync('data/manual/navigation', { recursive: true })
    .filter(file => typeof file === 'string' && file.endsWith('.json'))
    .flatMap(file => navigationPointLibrarySchema.parse(JSON.parse(readFileSync(`data/manual/navigation/${file}`, 'utf8'))).points)
    .filter(point => point.kind === 'navigation')
    .filter(point => point.pointType === 'weekly-boss')

  it.each(expected)('%s uses its original map portrait', (name, iconId) => {
    const matches = points.filter(point => point.name === name)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.every(point => point.iconId === iconId)).toBe(true)
    expect(navigationPointTypes['weekly-boss'].icons).toContain(iconId)
    expect(navigationIconById(iconId)).toMatchObject({ name, source: 'map' })
  })
})

