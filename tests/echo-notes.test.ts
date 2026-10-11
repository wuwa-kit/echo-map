import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { echoNotesSchema } from '../src/domain/schema.ts'

describe('echo notes', () => {
  it('loads the distinguishing weapon notes from the standalone config', () => {
    const notes = echoNotesSchema.parse(JSON.parse(readFileSync(new URL('../data/config/echo-notes.json', import.meta.url), 'utf8')))
    expect(notes).toEqual({
      '心傀·喜': '刀', '心傀·怒': '斧头', '心傀·忧': '剑',
      '心傀·思': '锤', '心傀·悲': '棒球棍', '心傀·恐': '锏',
    })
    expect(notes['阿嗞嗞']).toBeUndefined()
  })

  it('rejects blank names and invalid notes', () => {
    expect(echoNotesSchema.safeParse({ ' ': '刀' }).success).toBe(false)
    expect(echoNotesSchema.safeParse({ '心傀·喜': ' ' }).success).toBe(false)
    expect(echoNotesSchema.safeParse({ '心傀·喜': 1 }).success).toBe(false)
  })
})
