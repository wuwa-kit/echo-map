import type { EchoDefinition, SonataEffect } from '../../src/domain/types.ts'

export interface WikiSnapshot {
  fetchedAt: string
  totalEchoCount: number
  excludedEchoNames: string[]
  sonatas: SonataEffect[]
  echoes: EchoDefinition[]
}

export function withSonataEchoIds(
  sonatas: readonly Omit<SonataEffect, 'c1EchoIds' | 'c3EchoIds'>[],
  echoes: readonly EchoDefinition[],
): SonataEffect[] {
  return sonatas.map((sonata) => {
    const members = echoes.filter(({ sonataIds }) => sonataIds.includes(sonata.id))
    return {
      ...sonata,
      c1EchoIds: [...new Set(members.filter(({ cost }) => cost === 1).map(({ id }) => id))].sort(),
      c3EchoIds: [...new Set(members.filter(({ cost }) => cost === 3).map(({ id }) => id))].sort(),
    }
  })
}
