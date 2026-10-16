import { expect, it } from 'vitest'
import { parseSonataMembers, validateWikiTitle, wikiEntryId } from '../scripts/lib/wiki-membership.ts'

const detail = (components: unknown[]) => ({ data: { content: { modules: [{ title: '对应声骸', components }] } } })

it('prefers the destination URL over stale entry IDs and rejects conflicting URLs', () => {
  expect(wikiEntryId({ content: { linkConfig: { entryId: '1408881479672999936', linkUrl: 'https://wiki.kurobbs.com/mc/item/1431439416570245120' }, linkId: '1408881479672999936' } })).toBe('1431439416570245120')
  expect(() => wikiEntryId({ content: { linkConfig: { linkUrl: '/mc/item/123' }, linkUrl: '/mc/item/456' } })).toThrow('链接冲突')
})

it('rejects another sonata detail even when its membership structure is valid', () => {
  expect(() => validateWikiTitle({ data: { content: { title: '荣斗铸锋之冠' } } }, '命理崩毁之弦')).toThrow('标题不匹配')
  expect(() => validateWikiTitle({ data: { content: { title: ' 命理崩毁之弦 ' } } }, '命理崩毁之弦')).not.toThrow()
  expect(() => validateWikiTitle({ data: { content: { title: '镜影流电之瞬（合鸣）' } } }, '镜影流电之瞬')).not.toThrow()
  expect(() => validateWikiTitle({ data: { content: {} } }, '命理崩毁之弦')).toThrow('标题不匹配')
})

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
