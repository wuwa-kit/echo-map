import { z } from 'zod'
import { pointLibrarySchema } from '../domain/schema.ts'
import type { PointLibrary } from '../domain/types.ts'

const snapshotSchema = z.object({ library: pointLibrarySchema, revision: z.string() })
const versionsSchema = z.array(z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/u), savedAt: z.string() }))

async function request(path: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/editor/${path}`, options)
  const body: unknown = await response.json()
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body)
    throw new Error(error.success ? error.data.error : `保存失败：${response.status}`)
  }
  return body
}

export async function readEditorLibrary() {
  return snapshotSchema.parse(await request('library'))
}

export async function saveEditorLibrary(library: PointLibrary, revision: string) {
  return snapshotSchema.parse(await request('library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ library, revision }) }))
}

export async function readEditorVersions() {
  return versionsSchema.parse(await request('versions'))
}

export async function readEditorVersion(revision: string) {
  return pointLibrarySchema.parse(await request(`versions/${encodeURIComponent(revision)}`))
}
