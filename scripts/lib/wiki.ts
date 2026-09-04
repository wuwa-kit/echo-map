import type { EchoDefinition, SonataEffect } from '../../src/domain/types.ts'

export interface WikiSnapshot {
  fetchedAt: string
  totalEchoCount: number
  excludedEchoNames: string[]
  sonatas: SonataEffect[]
  echoes: EchoDefinition[]
}
