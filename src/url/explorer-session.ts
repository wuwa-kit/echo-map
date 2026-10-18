import { z } from 'zod'
import type { ExplorerSerializedQueryValues } from './explorer-url.ts'

export const explorerSettingsSchema = z.object({
  mode: z.enum(['use', 'edit']).catch('use'),
  pointsManager: z.enum(['', 'open']).catch(''),
  pointsKind: z.enum(['navigation', 'echo']).catch('navigation'),
  editorTab: z.enum(['navigation', 'echo']).catch('navigation'),
  pointsMap: z.string().catch(''),
  pointsStatus: z.enum(['all', 'pending', 'adopted', 'conflict', 'review']).catch('all'),
  pointsOperation: z.enum(['all', 'added', 'modified', 'deleted']).catch('all'),
  pointsDuplicate: z.enum(['0', '1']).catch('0'),
  editorSonatas: z.string().catch(''),
  editorCosts: z.string().transform(value => ['1', '3'].filter(cost => value.split(',').includes(cost)).join(',')).catch(''),
})

export type ExplorerSettings = z.infer<typeof explorerSettingsSchema>
export type ExplorerSettingKey = keyof ExplorerSettings
export type ExplorerSessionQuery = ExplorerSerializedQueryValues & Partial<Record<ExplorerSettingKey, string>>

export const explorerSettingKeys = explorerSettingsSchema.keyof().options
export const explorerQueryKeys = [
  'canvasScale', 'map', 'region', 'floor', 'floorStyle', 'gravity', 'echoes',
  'sonatas', 'costs', 'provisional', 'hideNonTeleport', 'panel', 'sheet', 'x', 'y', 'zoom',
  ...explorerSettingKeys,
] as const satisfies readonly (keyof ExplorerSessionQuery)[]

export function pickExplorerQuery(values: Record<string, unknown>): ExplorerSessionQuery {
  const query: ExplorerSessionQuery = {}
  for (const key of explorerQueryKeys) {
    const raw = values[key]
    const value: unknown = Array.isArray(raw) ? raw[0] : raw
    if (typeof value === 'string' && value.trim()) query[key] = value.trim()
  }
  return query
}

export function serializeExplorerSettings(settings: ExplorerSettings): ExplorerSessionQuery {
  const defaults = explorerSettingsSchema.parse({})
  const query: ExplorerSessionQuery = {}
  for (const key of explorerSettingKeys) {
    if (settings[key] !== defaults[key]) query[key] = settings[key]
  }
  return query
}
