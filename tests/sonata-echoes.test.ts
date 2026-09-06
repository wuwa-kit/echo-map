import { describe, expect, it } from 'vitest'
import { withSonataEchoIds } from '../scripts/lib/wiki.ts'
import { mapDatasetSchema, wikiCatalogueSchema } from '../src/domain/schema.ts'
import type { EchoDefinition, MapDataset, SonataEffect } from '../src/domain/types.ts'
import { referenceDataset } from './fixtures/point-library.ts'

const echoes: EchoDefinition[] = [
  { id: 'echo-2', name: '小声骸乙', cost: 1, sonataIds: ['set-a', 'set-b'], iconUrl: '', sourceId: 2 },
  { id: 'echo-1', name: '小声骸甲', cost: 1, sonataIds: ['set-a'], iconUrl: '', sourceId: 1 },
  { id: 'echo-3', name: '精英声骸', cost: 3, sonataIds: ['set-a', 'set-b'], iconUrl: '', sourceId: 3 },
  { id: 'echo-4', name: '独属乙套装', cost: 1, sonataIds: ['set-b'], iconUrl: '', sourceId: 4 },
]
const sonatas: SonataEffect[] = [
  { id: 'set-a', name: '甲套装', iconUrl: '', sourceId: 1, c1EchoIds: ['echo-1', 'echo-2'], c3EchoIds: ['echo-3'] },
  { id: 'set-b', name: '乙套装', iconUrl: '', sourceId: 2, c1EchoIds: ['echo-2', 'echo-4'], c3EchoIds: ['echo-3'] },
  { id: 'set-empty', name: '空套装', iconUrl: '', sourceId: 3, c1EchoIds: [], c3EchoIds: [] },
]

describe('sonata echo membership', () => {
  it('builds sorted C1/C3 lists for every set and replaces stale lists without changing input', () => {
    const stale = sonatas.map((sonata) => ({ ...sonata, c1EchoIds: ['stale-id'], c3EchoIds: [] }))
    const input = structuredClone(stale)
    expect(withSonataEchoIds(stale, echoes)).toEqual(sonatas)
    expect(stale).toEqual(input)
    expect(withSonataEchoIds(stale, [...echoes].reverse())).toEqual(sonatas)
    expect(withSonataEchoIds(stale, [...echoes, ...echoes])).toEqual(sonatas)
    expect(withSonataEchoIds(stale, [])).toEqual(sonatas.map((sonata) => ({ ...sonata, c1EchoIds: [], c3EchoIds: [] })))
  })

  it('accepts complete bidirectional memberships and explicit empty lists', () => {
    expect(wikiCatalogueSchema.safeParse({ sonatas, echoes }).success).toBe(true)
  })

  it.each<{
    problem: string
    change: (catalogue: Pick<MapDataset, 'sonatas' | 'echoes'>) => void
  }>([
    { problem: 'duplicate IDs', change: ({ sonatas: [set] }) => { set?.c1EchoIds.push('echo-1') } },
    { problem: 'unknown echo', change: ({ sonatas: [set] }) => { set?.c1EchoIds.push('unknown') } },
    { problem: 'wrong COST', change: ({ sonatas: [set] }) => { set?.c1EchoIds.push('echo-3') } },
    { problem: 'wrong set', change: ({ sonatas: [set] }) => { set?.c1EchoIds.push('echo-4') } },
    { problem: 'missing member', change: ({ sonatas: [set] }) => { set?.c3EchoIds.pop() } },
    { problem: 'unknown sonata', change: ({ echoes: [echo] }) => { echo?.sonataIds.push('unknown') } },
  ])('rejects $problem in both wiki and application data', ({ change }) => {
    const catalogue = structuredClone({ sonatas, echoes })
    change(catalogue)
    expect(wikiCatalogueSchema.safeParse(catalogue).success).toBe(false)
    expect(mapDatasetSchema.safeParse({ ...referenceDataset, ...catalogue }).success).toBe(false)
  })

  it.each(['c1EchoIds', 'c3EchoIds'])('requires an explicit %s field', (field) => {
    const incomplete = sonatas.map((sonata) => Object.fromEntries(Object.entries(sonata).filter(([key]) => key !== field)))
    expect(wikiCatalogueSchema.safeParse({ sonatas: incomplete, echoes }).success).toBe(false)
  })
})
