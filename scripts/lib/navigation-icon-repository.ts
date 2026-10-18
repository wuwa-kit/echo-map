import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import type { MapDataset } from '../../src/domain/types.ts'
import { builtInIconType } from '../../src/domain/navigation-point-types.ts'
import { serializeJson } from '../../src/utils/json.ts'
import { pointLibraryFiles, readPointFiles, replacePointFiles, withPointFilesLock } from './point-files.ts'
import type { IconRemovalResolution } from '../../src/domain/icon-removal.ts'
import { navigationIconLibrarySchema, validateIconLibraryUpdate } from '../../src/domain/navigation-icon-library.ts'
import { writeJson } from './files.ts'
import { PointRepositoryError } from './point-repository.ts'

export function createNavigationIconRepository(path: string, getDataset?: () => Promise<MapDataset>) {
  let pending: Promise<unknown> = Promise.resolve()
  async function read() {
    const text = await readFile(path, 'utf8')
    return { library: navigationIconLibrarySchema.parse(JSON.parse(text)), revision: createHash('sha256').update(text).digest('hex') }
  }
  function save(value: unknown, revision: string, resolutions: IconRemovalResolution[] = []) {
    const operation = pending.then(() => withPointFilesLock(dirname(path), async () => {
      const current = await read()
      if (revision !== current.revision) throw new PointRepositoryError('仓库图标配置已被其他页面或文件修改，当前编辑已保留，请核对冲突后重新载入', 409)
      const library = validateIconLibraryUpdate(value, current.library)
      if (getDataset) {
        const dataset = await getDataset()
        const points = await readPointFiles(dirname(path), dataset, 'manual')
        const assigned = new Set(library.categories.flatMap(category => category.icons.map(icon => icon.iconId)))
        const removed = current.library.categories.flatMap(category => category.icons.filter(icon => !assigned.has(icon.iconId) && !builtInIconType(icon.iconId)?.builtIn).map(icon => ({ id: icon.iconId, category })))
        const replacements = new Map<string, string>()
        for (const { id, category } of removed) {
          const references = points.library.points.filter(point => point.kind === 'navigation' && point.iconId === id)
          const resolution = resolutions.find(item => item.iconId === id)
          if (!references.length && !resolution) continue
          if (!resolution) throw new PointRepositoryError(`图标 ${id} 有 ${references.length} 个点位引用，请先选择替代图标或图标未找到`, 409)
          if (JSON.stringify(references.map(point => point.id).sort()) !== JSON.stringify([...resolution.pointIds].sort())) throw new PointRepositoryError('点位引用已变化，请重新打开移除操作', 409)
          if (resolution.replacementId !== 'icon-not-found' && (resolution.replacementId === id || !category.icons.some(icon => icon.iconId === resolution.replacementId) || !assigned.has(resolution.replacementId))) throw new PointRepositoryError('替代图标必须是本分类中保留的其它图标', 400)
          replacements.set(id, resolution.replacementId)
        }
        const affected = new Set<string>()
        const updated = { ...points.library, points: points.library.points.map(point => {
          if (point.kind !== 'navigation' || !point.iconId) return point
          const iconId = replacements.get(point.iconId)
          const file = points.fileByPointId.get(point.id)
          if (iconId && file) affected.add(file)
          if (iconId === 'icon-not-found') return { ...point, iconId, pointType: 'unclassified' as const, navigationKind: 'landmark' as const, mode: point.mode === 'fast-travel' ? 'fast-travel' as const : 'landmark' as const }
          return iconId ? { ...point, iconId } : point
        }) }
        const previous = new Map(points.texts)
        previous.set(basename(path), await readFile(path, 'utf8'))
        const next = new Map(points.texts)
        const grouped = pointLibraryFiles(updated, dataset, 'manual')
        for (const file of affected) {
          const text = grouped.get(file)
          if (text === undefined) throw new Error('替换图标后点位文件缺失')
          next.set(file, text)
        }
        next.set(basename(path), `${serializeJson(library, 2)}\n`)
        await replacePointFiles(dirname(path), previous, next)
      } else await writeJson(path, library)
      return read()
    }))
    pending = operation.catch(() => {})
    return operation
  }
  return { read, save }
}
