import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parsePointLibrary } from '../../src/domain/point-library.ts'
import { MAIN_MAP_STATE_ID, pointRegionResolver } from '../../src/domain/point-region.ts'
import type { AuthoredPoint, MapDataset, PointFileRevisions, PointLibrary } from '../../src/domain/types.ts'
import { gameToMapCoordinate } from '../../src/map/projection.ts'
import { serializeJson } from '../../src/utils/json.ts'

export type PointSource = 'manual' | 'official'
const queues = new Map<string, Promise<unknown>>()

export function withPointFilesLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  const key = resolve(root)
  const work = (queues.get(key) ?? Promise.resolve()).then(action)
  const settled = work.catch(() => undefined)
  queues.set(key, settled)
  void settled.then(() => { if (queues.get(key) === settled) queues.delete(key) })
  return work
}

export function pointFileRevision(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function pointFilePath(point: AuthoredPoint, dataset: MapDataset, source: PointSource): string {
  const { x, y } = point.coordinate
  if (x === null || y === null) throw new Error(`点位 ${point.id} 缺少 XY`)
  const region = pointRegionResolver(dataset)(point.stateId, gameToMapCoordinate(x, y))
  if (!region) throw new Error(`无法判断点位 ${point.id} 所属地区`)
  const path = point.stateId === MAIN_MAP_STATE_ID ? `${point.stateId}/${region.id}.json` : `${point.stateId}.json`
  if (!/^\d+(?:\/\d+(?:-\d+)?)?\.json$/u.test(path)) throw new Error(`无效地图分片：${path}`)
  return source === 'manual' ? `${point.kind}/${path}` : path
}

export function pointLibraryFiles(library: PointLibrary, dataset: MapDataset, source: PointSource): Map<string, string> {
  const files = new Map<string, AuthoredPoint[]>()
  for (const point of parsePointLibrary(library, dataset, source).points) {
    const path = pointFilePath(point, dataset, source)
    const points = files.get(path) ?? []
    points.push(point)
    files.set(path, points)
  }
  return new Map([...files].sort(([left], [right]) => left.localeCompare(right)).map(([path, points]) => [
    path, `${serializeJson({ version: 1, points: points.sort((left, right) => left.id.localeCompare(right.id)) }, source === 'manual' ? 2 : undefined)}\n`,
  ]))
}

export async function readPointFileTexts(root: string, source: PointSource): Promise<Map<string, string>> {
  const texts = new Map<string, string>()
  async function visit(prefix: string, mainMap: boolean) {
    const entries = await readdir(join(root, prefix), { withFileTypes: true }).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
      throw error
    })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = `${prefix}${entry.name}`
      if (entry.isDirectory() && !mainMap && entry.name === String(MAIN_MAP_STATE_ID)) {
        await visit(`${path}/`, true)
      } else if (entry.name.endsWith('.json')) {
        const pattern = mainMap ? /^\d+(?:-\d+)?\.json$/u : /^\d+\.json$/u
        if (!entry.isFile() || !pattern.test(entry.name)) throw new Error(`无效点位文件：${path}`)
        texts.set(path, await readFile(join(root, path), 'utf8'))
      } else {
        if (entry.isSymbolicLink() || entry.isDirectory()) throw new Error(`无效点位目录：${path}`)
      }
    }
  }
  if (source === 'manual') {
    await visit('echo/', false)
    await visit('navigation/', false)
  } else await visit('', false)
  return texts
}

export async function readPointFiles(root: string, dataset: MapDataset, source: PointSource) {
  const texts = await readPointFileTexts(root, source)
  const points: AuthoredPoint[] = []
  const revision: PointFileRevisions = {}
  const fileByPointId = new Map<string, string>()
  for (const [path, text] of texts) {
    const library = parsePointLibrary(JSON.parse(text), dataset, source)
    if (!library.points.length) throw new Error(`空点位文件应删除：${path}`)
    for (const point of library.points) {
      if (pointFilePath(point, dataset, source) !== path) throw new Error(`点位 ${point.id} 不属于文件 ${path}`)
      fileByPointId.set(point.id, path)
      points.push(point)
    }
    revision[path] = pointFileRevision(text)
  }
  const library = parsePointLibrary({ version: 1, points: points.sort((left, right) => left.id.localeCompare(right.id)) }, dataset, source)
  return { library, revision, texts, fileByPointId }
}

export function readPointLibrary(root: string, dataset: MapDataset, source: PointSource): Promise<PointLibrary> {
  return withPointFilesLock(root, async () => (await readPointFiles(root, dataset, source)).library)
}

// Stage every destination first; restore completed changes if a later rename/delete fails.
export async function replacePointFiles(root: string, previous: ReadonlyMap<string, string>, next: ReadonlyMap<string, string>): Promise<void> {
  const changed = [...new Set([...previous.keys(), ...next.keys()])].filter((path) => previous.get(path) !== next.get(path))
  const temporary = new Map<string, string>()
  const completed: string[] = []
  try {
    for (const path of changed) {
      const text = next.get(path)
      if (text === undefined) continue
      const target = join(root, path)
      await mkdir(dirname(target), { recursive: true })
      const staging = `${target}.${randomUUID()}.tmp`
      temporary.set(path, staging)
      await writeFile(staging, text, 'utf8')
    }
    for (const path of changed) {
      const staging = temporary.get(path)
      if (staging) await rename(staging, join(root, path))
      else await rm(join(root, path))
      completed.push(path)
    }
  } catch (error) {
    for (const path of completed.reverse()) {
      const text = previous.get(path)
      if (text === undefined) await rm(join(root, path), { force: true })
      else await writeFile(join(root, path), text, 'utf8')
    }
    throw error
  } finally {
    await Promise.all([...temporary.values()].map((path) => rm(path, { force: true })))
  }
}

export function writePointLibrary(root: string, library: PointLibrary, dataset: MapDataset, source: PointSource): Promise<void> {
  return withPointFilesLock(root, async () => {
    const next = pointLibraryFiles(library, dataset, source)
    await replacePointFiles(root, await readPointFileTexts(root, source), next)
  })
}
