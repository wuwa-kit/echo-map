import { randomBytes } from 'node:crypto'

const DEFAULT_TIMEOUT_MS = 30_000

export function kuroHeaders(wikiType: 9 | 10, stateId?: number): HeadersInit {
  const headers: Record<string, string> = {
    devcode: randomBytes(16).toString('hex'),
    source: 'h5',
    wiki_type: String(wikiType),
  }

  if (stateId !== undefined) {
    headers.state_id = String(stateId)
  }

  return headers
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, attempts = 3): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${url}`)
      }

      return await response.json() as T
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 350 * attempt))
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError
}

export async function fetchBytes(url: string, attempts = 3): Promise<Uint8Array> {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${url}`)
      }

      return new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 350 * attempt))
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError
}

export async function fetchOptionalJson<T>(url: string, fallback: T): Promise<T> {
  try {
    return await fetchJson<T>(url)
  } catch (error) {
    console.warn(`跳过不可用的可选资源：${url}`, error)
    return fallback
  }
}

export async function postFormJson<T>(
  url: string,
  headers: HeadersInit,
  body: Record<string, string>,
): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: {
      ...headers,
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams(body),
  })
}
