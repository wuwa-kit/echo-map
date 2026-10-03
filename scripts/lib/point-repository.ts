import { pointFileRevisionsSchema, pointLibraryChangesSchema } from '../../src/domain/point-changes.ts'
import { pointFilePath, pointFileRevision, pointLibraryFiles, readPointFiles, replacePointFiles, withPointFilesLock } from './point-files.ts'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parsePointLibrary } from '../../src/domain/point-library.ts'
import type { MapDataset, PointLibrary } from '../../src/domain/types.ts'
import { serializeJson } from '../../src/utils/json.ts'

export class PointRepositoryError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function createPointRepository(path: string, historyPath: string, getDataset: () => Promise<MapDataset>) {
  const revisionOf = pointFileRevision
  const conflict = () => new PointRepositoryError('相关地区文件已被其他页面修改。请重新载入点位库，核对后再保存；当前编辑内容已保留。', 409)

  function read() {
    return withPointFilesLock(path, async () => {
      const { library, revision } = await readPointFiles(path, await getDataset(), 'manual')
      return { library, revision }
    })
  }

  function save(value: unknown, revisionValue: unknown) {
    return withPointFilesLock(path, async () => {
      const changes = pointLibraryChangesSchema.parse(value)
      const revision = pointFileRevisionsSchema.parse(revisionValue)
      const dataset = await getDataset()
      const current = await readPointFiles(path, dataset, 'manual')
      const check = (file: string) => {
        if (revision[file] !== current.revision[file]) throw conflict()
      }
      if (changes.replaceAll) {
        for (const file of new Set([...Object.keys(revision), ...Object.keys(current.revision)])) check(file)
      }
      const points = new Map(current.library.points.map((point) => [point.id, point]))
      const affected = new Set<string>()
      for (const { before, after } of changes.edits) {
        const id = before?.id ?? after?.id
        if (!id) throw new Error('无效的点位修改')
        if (JSON.stringify(points.get(id) ?? null) !== JSON.stringify(before)) throw conflict()
        const oldFile = current.fileByPointId.get(id)
        if (oldFile) affected.add(oldFile)
        if (after) {
          affected.add(pointFilePath(after, dataset, 'manual'))
          points.set(id, after)
        } else points.delete(id)
      }
      for (const file of affected) check(file)
      const library = parsePointLibrary({ version: 1, points: [...points.values()] }, dataset, 'manual')
      const grouped = pointLibraryFiles(library, dataset, 'manual')
      const next = new Map(current.texts)
      for (const file of affected) {
        const text = grouped.get(file)
        if (text === undefined) next.delete(file)
        else next.set(file, text)
      }
      if (affected.size) {
        const previous = `${serializeJson(current.library, 2)}\n`
        await mkdir(historyPath, { recursive: true })
        await writeFile(join(historyPath, `${revisionOf(previous)}.json`), previous, 'utf8')
        await replacePointFiles(path, current.texts, next)
      }
      const saved = await readPointFiles(path, dataset, 'manual')
      return { library: saved.library, revision: saved.revision }
    })
  }

  async function versions() {
    await mkdir(historyPath, { recursive: true })
    const files = (await readdir(historyPath)).filter((file) => /^[a-f0-9]{64}\.json$/u.test(file))
    const result = await Promise.all(files.map(async (file) => ({ revision: file.slice(0, -5), savedAt: (await stat(join(historyPath, file))).mtime.toISOString() })))
    return result.sort((left, right) => right.savedAt.localeCompare(left.savedAt)).slice(0, 50)
  }

  async function version(revision: string): Promise<PointLibrary> {
    if (!/^[a-f0-9]{64}$/u.test(revision)) throw new PointRepositoryError('无效的历史版本', 400)
    const text = await readFile(join(historyPath, `${revision}.json`), 'utf8')
    if (revisionOf(text) !== revision) throw new PointRepositoryError('历史版本已损坏，未恢复任何数据', 400)
    return parsePointLibrary(JSON.parse(text), await getDataset(), 'manual')
  }

  return { read, save, versions, version }
}
