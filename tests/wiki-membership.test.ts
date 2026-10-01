import { expect, it } from 'vitest'
import { parseSonataMembers, wikiEntryId } from '../scripts/lib/wiki-membership.ts'

const detail = (components: unknown[]) => ({ data: { content: { modules: [{ title: '对应声骸', components }] } } })

it('uses exact string entry links instead of rounded catalogue entry IDs', () => {
  expect(wikiEntryId({ entryId: 1553877397214363600, content: { linkConfig: { entryId: '1553877397214363648' } } })).toBe('1553877397214363648')
  expect(wikiEntryId({ content: { linkUrl: 'https://wiki.kurobbs.com/mc/item/1553889998205132800' } })).toBe('1553889998205132800')
  expect(() => wikiEntryId({ entryId: 123, content: {} })).toThrow()
})

it('deduplicates image and text links and excludes COST 4 members', () => {
  expect([...parseSonataMembers(detail([
    { title: '「COST 1」', content: '<a href="https://wiki.kurobbs.com/mc/item/123"><img></a><a href="/mc/item/123">心傀&middot;怒</a>' },
    { title: '「COST 3」', content: '<a href="/mc/item/456">精英</a>' },
    { title: '「COST 4」', content: '<a href="/mc/item/789">BOSS</a>' },
  ]))]).toEqual([['123', 1], ['456', 3]])
  expect(parseSonataMembers(detail([{ title: 'COST 4', content: '' }])).size).toBe(0)
})

it('rejects missing sections, missing links and conflicting COST instead of silently dropping members', () => {
  expect(() => parseSonataMembers({ data: { content: { modules: [] } } })).toThrow()
  expect(() => parseSonataMembers(detail([]))).toThrow()
  expect(() => parseSonataMembers(detail([{ title: 'COST 1', content: '声骸' }]))).toThrow()
  expect(() => parseSonataMembers(detail([1, 3].map((cost) => ({ title: `COST ${cost}`, content: '<a href="/mc/item/123">声骸</a>' }))))).toThrow()
})
