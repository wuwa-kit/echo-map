import { afterEach, expect, it, vi } from 'vitest'
import { syncWiki } from '../scripts/sync-wiki.ts'
import { postFormJson } from '../scripts/lib/http.ts'
import { writeJson } from '../scripts/lib/files.ts'

vi.mock('../scripts/lib/http.ts')
vi.mock('../scripts/lib/files.ts', () => ({
  isMainModule: () => false,
  projectPath: (...parts: string[]) => parts.join('/'),
  writeJson: vi.fn(),
}))

afterEach(() => { vi.restoreAllMocks() })

it('preserves Wiki display order while writing whitelisted per-COST sonata memberships', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const tag = (id: string, name: string) => ({ id, name, children: [] })
  const record = (id: number, name: string, relateTagIds: string[] = []) => ({ id, name, content: { contentUrl: '', relateTagIds } })
  vi.mocked(postFormJson).mockImplementation(async (_url, _headers, body) => ({
    data: {
      results: {
        records: body.catalogueId === '1107' ? [
          record(11, '小声骸', ['c1', 'set-a', 'set-b']),
          record(12, '精英声骸', ['c3', 'set-a']),
          record(13, 'BOSS', ['c4', 'set-a']),
          record(14, '无套装声骸', ['c1']),
        ] : [record(2, '乙套装'), record(3, '空套装'), record(1, '甲套装')],
      },
      tagTree: [
        { id: 'sets', name: '套装', children: [tag('set-a', '甲套装'), tag('set-b', '乙套装'), tag('set-empty', '空套装')] },
        { id: 'costs', name: 'COST', children: [tag('c1', 'C1'), tag('c3', 'C3'), tag('c4', 'C4')] },
      ],
    },
  }))

  const snapshot = await syncWiki()
  expect(snapshot.echoes).toHaveLength(2)
  expect(snapshot.excludedEchoNames).toEqual(expect.arrayContaining(['BOSS', '无套装声骸']))
  expect(snapshot.sonatas.map(({ id }) => id)).toEqual(['wiki-sonata-2', 'wiki-sonata-3', 'wiki-sonata-1'])
  expect(snapshot.sonatas).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'wiki-sonata-1', c1EchoIds: ['wiki-echo-11'], c3EchoIds: ['wiki-echo-12'] }),
    expect.objectContaining({ id: 'wiki-sonata-2', c1EchoIds: ['wiki-echo-11'], c3EchoIds: [] }),
    expect.objectContaining({ id: 'wiki-sonata-3', c1EchoIds: [], c3EchoIds: [] }),
  ]))
  expect(writeJson).toHaveBeenCalledWith('data/generated/wiki.json', snapshot)
})
