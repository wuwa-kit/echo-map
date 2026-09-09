import { describe, expect, it } from 'vitest'
import { compactWikiEchoId, parseWikiEchoId } from '../src/url/wiki-id.ts'

describe('wiki URL IDs', () => {
  it('round-trips a compact echo source ID', () => {
    expect(parseWikiEchoId('11232')).toBe('wiki-echo-11232')
    expect(compactWikiEchoId('wiki-echo-11232')).toBe('11232')
  })

  it.each(['', 'wiki-echo-11232', 'unknown', '11232,11105'])('rejects obsolete or invalid compact echo IDs: %s', (value) => {
    expect(parseWikiEchoId(value)).toBeUndefined()
  })

  it.each(['11232', 'echo-11232', 'unknown'])('does not serialize invalid internal echo IDs: %s', (value) => {
    expect(compactWikiEchoId(value)).toBeUndefined()
  })
})
