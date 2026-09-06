import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parsePointLibrary } from '../../src/domain/point-library.ts'
import type { MapDataset, PointLibrary } from '../../src/domain/types.ts'

export class PointRepositoryError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function createPointRepository(path: string, historyPath: string, getDataset: () => Promise<MapDataset>) {
  let queue: Promise<unknown> = Promise.resolve()
  const revisionOf = (text: string) => createHash('sha256').update(text).digest('hex')

  async function read() {
    const text = await readFile(path, 'utf8')
    return { library: parsePointLibrary(JSON.parse(text), await getDataset(), 'manual'), revision: revisionOf(text) }
  }

  async function save(value: unknown, revision: string) {
    const work = queue.then(async () => {
      const library = parsePointLibrary(value, await getDataset(), 'manual')
      const previous = await readFile(path, 'utf8')
      const currentRevision = revisionOf(previous)
      if (revision !== currentRevision) throw new PointRepositoryError('数据已被其他页面修改。请重新载入点位库，核对后再保存；当前编辑内容已保留。', 409)
      await mkdir(historyPath, { recursive: true })
      await writeFile(join(historyPath, `${currentRevision}.json`), previous, 'utf8')
      const text = `${JSON.stringify(library, null, 2)}\n`
      await mkdir(dirname(path), { recursive: true })
      const temporary = `${path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, text, 'utf8')
        await rename(temporary, path)
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined)
      }
      return { library, revision: revisionOf(text) }
    })
    queue = work.catch(() => undefined)
    return work
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
