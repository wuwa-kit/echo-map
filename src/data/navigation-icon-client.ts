import { z } from 'zod'
import { navigationIconLibrarySchema } from '../domain/navigation-icon-library.ts'
import type { NavigationIconLibrary } from '../domain/types.ts'
import type { IconRemovalResolution } from '../domain/icon-removal.ts'

const snapshotSchema = z.object({ library: navigationIconLibrarySchema, revision: z.string() })
async function request(options?: RequestInit) {
  const response = await fetch('/api/icon-library', options)
  if (!response.headers.get('content-type')?.includes('application/json')) return null
  const body: unknown = await response.json()
  if (!response.ok) {
    if (!options && [403, 404, 405].includes(response.status)) return null
    const error = z.object({ error: z.string() }).safeParse(body)
    throw new Error(error.success ? error.data.error : `图标配置请求失败：${response.status}`)
  }
  return snapshotSchema.parse(body)
}
export function readNavigationIconLibrary() { return request() }
export async function saveNavigationIconLibrary(library: NavigationIconLibrary, revision: string, resolutions?: IconRemovalResolution[]) {
  const result = await request({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ library, revision, resolutions }) })
  if (!result) throw new Error('本机写入接口不可用，修改尚未同步')
  return result
}
