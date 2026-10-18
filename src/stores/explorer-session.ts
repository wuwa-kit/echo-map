import { shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { freeze, produce } from 'immer'
import { readLastExplorerQuery, saveLastExplorerQuery } from '../url/explorer-history.ts'
import { createExplorerQueryValues } from '../url/explorer-url.ts'
import type { ExplorerUrlSnapshot } from '../url/explorer-url.ts'
import { explorerSettingKeys, explorerSettingsSchema, serializeExplorerSettings } from '../url/explorer-session.ts'
import type { ExplorerSessionQuery, ExplorerSettings } from '../url/explorer-session.ts'
import type { MapDataset } from '../domain/types.ts'
import { pointMapFilterOptions, pointMapFilterSelection } from '../components/point-map-options.ts'

export const useExplorerSessionStore = defineStore('explorer-session', () => {
  const query = shallowRef<ExplorerSessionQuery>(freeze({}, true))
  const settings = shallowRef<ExplorerSettings>(freeze(explorerSettingsSchema.parse({}), true))
  const revision = shallowRef(0)
  let initialized = false

  function initialize(): void {
    if (initialized) return
    initialized = true
    query.value = freeze(readLastExplorerQuery() ?? {}, true)
    settings.value = freeze(explorerSettingsSchema.parse(query.value), true)
  }

  function persist(): void {
    const next = produce(query.value, draft => {
      for (const key of explorerSettingKeys) delete draft[key]
      Object.assign(draft, serializeExplorerSettings(settings.value))
    })
    query.value = next
    saveLastExplorerQuery(next)
  }

  function importQuery(value: ExplorerSessionQuery): void {
    initialized = true
    query.value = freeze({ ...value }, true)
    settings.value = freeze(explorerSettingsSchema.parse(value), true)
    revision.value += 1
    persist()
  }

  function setSetting<Key extends keyof ExplorerSettings>(key: Key, value: ExplorerSettings[Key]): void {
    settings.value = produce(settings.value, draft => { draft[key] = value })
    persist()
  }

  function validateSettings(dataset: MapDataset): void {
    settings.value = produce(settings.value, draft => {
      draft.editorSonatas = [...new Set(draft.editorSonatas.split(',').filter(id => dataset.sonatas.some(sonata => sonata.id === id)))].join(',')
      draft.pointsMap = pointMapFilterSelection(pointMapFilterOptions(dataset, new Map()), draft.pointsMap).value
    })
    persist()
  }

  function saveMap(snapshot: ExplorerUrlSnapshot): void {
    const next = { ...createExplorerQueryValues(snapshot), ...serializeExplorerSettings(settings.value) }
    if (JSON.stringify(next) === JSON.stringify(query.value)) return
    query.value = freeze(next, true)
    saveLastExplorerQuery(next)
  }

  function shareQuery(snapshot: ExplorerUrlSnapshot): ExplorerSessionQuery & { share: string } {
    return { share: '1', ...createExplorerQueryValues(snapshot), ...serializeExplorerSettings(settings.value) }
  }

  return {
    query: shallowReadonly(query), settings: shallowReadonly(settings), revision: shallowReadonly(revision),
    initialize, importQuery, setSetting, validateSettings, saveMap, shareQuery,
  }
})
