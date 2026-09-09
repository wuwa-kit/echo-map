const WIKI_ECHO_ID_PREFIX = 'wiki-echo-'
const WIKI_ECHO_ID_PATTERN = /^wiki-echo-(\d+)$/u

export function parseWikiEchoId(value: string | null | undefined): string | undefined {
  const sourceId = value?.trim()
  return sourceId && /^\d+$/u.test(sourceId) ? `${WIKI_ECHO_ID_PREFIX}${sourceId}` : undefined
}

export function compactWikiEchoId(value: string): string | undefined {
  return value.match(WIKI_ECHO_ID_PATTERN)?.[1]
}
