export function fetchPublishedData(filename: string): Promise<Response> {
  const base = import.meta.env.VITE_CDN_BASE || '/'
  return fetch(`${base}data/${filename}`, { cache: import.meta.env.DEV ? 'no-store' : 'default' })
}
