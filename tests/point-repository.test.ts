import { mkdtemp, readFile, readdir, rename, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPointRepository } from '../scripts/lib/point-repository.ts'
import { pointFilePath, readPointFileTexts } from '../scripts/lib/point-files.ts'
import { isLocalEditorRequest } from '../scripts/editor-plugin.ts'
import { pointLibraryChanges } from '../src/domain/point-changes.ts'
import { mapToGameCoordinate } from '../src/map/projection.ts'
import type { AuthoredPoint, PointLibrary } from '../src/domain/types.ts'
import { mixedPoint, referenceDataset } from './fixtures/point-library.ts'

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return { ...fs, rename: vi.fn(fs.rename) }
})

const temporaryDirectories: string[] = []
afterEach(async () => {
  vi.mocked(rename).mockClear()
  for (const path of temporaryDirectories.splice(0)) {
    if (!path.startsWith(join(tmpdir(), 'echo-point-test-'))) throw new Error('临时目录超出测试范围')
    await rm(path, { recursive: true, force: true })
  }
})

const library = (...points: AuthoredPoint[]): PointLibrary => ({ version: 1, points })
const empty = library()

function atRegion(id: string, name: string) {
  const label = referenceDataset.regionLabels.find((label) => label.name === name)
  if (!label) throw new Error(`缺少地区 ${name}`)
  const [x, y] = mapToGameCoordinate(label.coordinate.mapX, label.coordinate.mapY)
  return { ...mixedPoint(id), stateId: label.stateId, coordinate: { x: Math.round(x), y: Math.round(y), z: 18 } }
}

async function repository() {
  const directory = await mkdtemp(join(tmpdir(), 'echo-point-test-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'manual')
  return { path, directory, create: () => createPointRepository(path, join(directory, 'history'), async () => referenceDataset) }
}

describe('point file persistence', () => {
  it('reopens sharded points without nulls and can restore an earlier version', async () => {
    const files = await repository()
    const repo = files.create()
    const initial = await repo.read()
    const saved = await repo.save(pointLibraryChanges(empty, library(mixedPoint())), initial.revision)
    const text = await readFile(join(files.path, pointFilePath(mixedPoint(), referenceDataset, 'manual')), 'utf8')
    expect(text).not.toContain(': null')
    expect(text).not.toContain('countryId')
    expect((await files.create().read()).library.points).toEqual([mixedPoint()])
    const oldRevision = (await repo.versions())[0]?.revision
    expect(oldRevision).toBeDefined()
    const old = await repo.version(oldRevision ?? '')
    expect(old).toEqual(empty)
    await repo.save(pointLibraryChanges(saved.library, old, true), saved.revision)
    expect((await repo.read()).library).toEqual(empty)
    expect(await readPointFileTexts(files.path, 'manual')).toHaveLength(0)
  })

  it('merges simultaneous edits in different shards across repository instances', async () => {
    const files = await repository()
    const first = files.create()
    const second = files.create()
    const initial = await first.read()
    const jinzhou = atRegion('jinzhou', '今州城')
    const mengzhou = atRegion('mengzhou', '玄方城')
    await Promise.all([
      first.save(pointLibraryChanges(empty, library(jinzhou)), initial.revision),
      second.save(pointLibraryChanges(empty, library(mengzhou)), initial.revision),
    ])
    expect((await first.read()).library.points).toEqual([jinzhou, mengzhou])
  })

  it('rejects a stale edit of the same shard without overwriting saved points', async () => {
    const repo = (await repository()).create()
    const initial = await repo.read()
    const results = await Promise.allSettled([
      repo.save(pointLibraryChanges(empty, library(mixedPoint('first'))), initial.revision),
      repo.save(pointLibraryChanges(empty, library(mixedPoint('second'))), initial.revision),
    ])
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { status: 409 } })
    expect((await repo.read()).library.points.map(({ id }) => id)).toEqual(['first'])
  })

  it('changes only affected files, sorts IDs and removes an empty source shard on a move', async () => {
    const files = await repository()
    const repo = files.create()
    const original = atRegion('z-point', '今州城')
    const untouched = atRegion('untouched', '冰原运输港')
    const saved = await repo.save(pointLibraryChanges(empty, library(original, untouched)), {})
    const untouchedPath = join(files.path, pointFilePath(untouched, referenceDataset, 'manual'))
    const date = new Date('2000-01-01T00:00:00Z')
    await utimes(untouchedPath, date, date)
    const previous = await readFile(untouchedPath, 'utf8')
    const moved = atRegion(original.id, '玄方城')
    const added = atRegion('a-point', '玄方城')
    const next = await repo.save(pointLibraryChanges(saved.library, library(moved, added, untouched)), saved.revision)
    expect(next.library.points.map(({ id }) => id)).toEqual(['a-point', 'untouched', 'z-point'])
    await expect(readFile(join(files.path, pointFilePath(original, referenceDataset, 'manual')))).rejects.toMatchObject({ code: 'ENOENT' })
    const destination: unknown = JSON.parse(await readFile(join(files.path, pointFilePath(moved, referenceDataset, 'manual')), 'utf8'))
    expect(destination).toMatchObject({ points: [{ id: 'a-point' }, { id: 'z-point' }] })
    expect(await readFile(untouchedPath, 'utf8')).toBe(previous)
    expect((await stat(untouchedPath)).mtimeMs).toBe(date.getTime())
  })

  it('does not resurrect a point deleted by another editor or overwrite a concurrent import', async () => {
    const repo = (await repository()).create()
    const point = atRegion('point', '今州城')
    const saved = await repo.save(pointLibraryChanges(empty, library(point)), {})
    await repo.save(pointLibraryChanges(saved.library, empty), saved.revision)
    await expect(repo.save(pointLibraryChanges(saved.library, library(atRegion(point.id, '玄方城'))), saved.revision)).rejects.toMatchObject({ status: 409 })
    await repo.save(pointLibraryChanges(empty, library(atRegion('other', '玄方城'))), {})
    await expect(repo.save(pointLibraryChanges(empty, library(point), true), {})).rejects.toMatchObject({ status: 409 })
  })

  it('rejects invalid imports and history traversal before changing files', async () => {
    const files = await repository()
    const repo = files.create()
    await expect(repo.save({ edits: [{ after: { ...mixedPoint(), coordinate: { x: 1, y: 2, z: null } } }], replaceAll: true }, {})).rejects.toThrow()
    expect(await readPointFileTexts(files.path, 'manual')).toHaveLength(0)
    await expect(repo.version('../points')).rejects.toThrow('无效的历史版本')
  })

  it('rolls back a cross-shard move after a disk failure and permits retry', async () => {
    const files = await repository()
    const repo = files.create()
    const original = atRegion('point', '今州城')
    const saved = await repo.save(pointLibraryChanges(empty, library(original)), {})
    const previous = await readPointFileTexts(files.path, 'manual')
    const edits = pointLibraryChanges(saved.library, library(atRegion(original.id, '玄方城')))
    vi.mocked(rename).mockRejectedValueOnce(new Error('文件被占用，无法替换'))
    await expect(repo.save(edits, saved.revision)).rejects.toThrow('无法替换')
    expect(await readPointFileTexts(files.path, 'manual')).toEqual(previous)
    expect((await readdir(files.path, { recursive: true })).some((name) => name.endsWith('.tmp'))).toBe(false)
    await repo.save(edits, saved.revision)
    expect((await repo.read()).library.points).toEqual([atRegion(original.id, '玄方城')])
  })

  it.each([
    ['127.0.0.1', 'localhost:5173', 'http://localhost:5173', true],
    ['::1', 'localhost:5173', undefined, true],
    ['192.168.1.5', 'localhost:5173', 'http://localhost:5173', false],
    ['127.0.0.1', 'localhost:5173', 'https://example.com', false],
    ['127.0.0.1', 'example.com', 'http://example.com', false],
  ])('checks editor network boundary (%s, %s)', (remoteAddress, host, origin, allowed) => {
    expect(isLocalEditorRequest({ socket: { remoteAddress }, headers: { host, origin } })).toBe(allowed)
  })
})
