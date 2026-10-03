import { z } from 'zod'
import { pointLibrarySchema, savedPointSchema } from './schema.ts'
import type { PointLibrary, PointLibraryChanges } from './types.ts'

export const pointFileRevisionsSchema = z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u))
export const projectPointSnapshotSchema = z.object({ library: pointLibrarySchema, revision: pointFileRevisionsSchema })
export const pointLibraryChangesSchema = z.object({
  edits: z.array(z.object({
    before: savedPointSchema.nullable().default(null),
    after: savedPointSchema.nullable().default(null),
  }).strict()),
  replaceAll: z.boolean(),
}).strict().superRefine(({ edits }, context) => {
  const ids = new Set<string>()
  for (const { before, after } of edits) {
    const id = before?.id ?? after?.id
    if (!id || ids.has(id) || (before && after && before.id !== after.id)) {
      context.addIssue({ code: 'custom', message: '点位修改必须使用唯一且不变的 ID' })
    }
    if (id) ids.add(id)
  }
})

export function pointLibraryChanges(previous: PointLibrary, next: PointLibrary, replaceAll = false): PointLibraryChanges {
  const before = new Map(previous.points.map((point) => [point.id, point]))
  const after = new Map(next.points.map((point) => [point.id, point]))
  return {
    replaceAll,
    edits: [...new Set([...before.keys(), ...after.keys()])].flatMap((id) => {
      const oldPoint = before.get(id) ?? null
      const newPoint = after.get(id) ?? null
      return JSON.stringify(oldPoint) === JSON.stringify(newPoint) ? [] : [{ before: oldPoint, after: newPoint }]
    }),
  }
}
