import type { EchoDefinition } from './types.ts'

export function searchEchoes(echoes: readonly EchoDefinition[], query: string): EchoDefinition[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  return echoes.filter((echo) => {
    const fields = [echo.name, `C${echo.cost}`]
      .map((value) => value.toLocaleLowerCase())
    return terms.every((term) => fields.some((field) => field.includes(term)))
  })
}
