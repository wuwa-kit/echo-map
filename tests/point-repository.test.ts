import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPointRepository } from '../scripts/lib/point-repository.ts'
import { isLocalEditorRequest } from '../scripts/editor-plugin.ts'
import { mixedPoint, referenceDataset } from './fixtures/point-library.ts'

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return { ...fs, rename: vi.fn(fs.rename) }
})

const temporaryDirectories: string[] = []
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

async function repository() {
  const directory = await mkdtemp(join(tmpdir(), 'echo-point-test-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'points.json')
  await writeFile(path, '{"version":1,"points":[]}\n')
  return { path, directory, create: () => createPointRepository(path, join(directory, 'history'), async () => referenceDataset) }
}

describe('point file persistence', () => {
  it('reopens saved points and can restore an earlier version', async () => {
    const files = await repository()
    const repo = files.create()
    const initial = await repo.read()
    const saved = await repo.save({ version: 1, points: [mixedPoint()] }, initial.revision)
    expect((await files.create().read()).library.points).toHaveLength(1)
    const history = await repo.versions()
    expect(history.map(({ revision }) => revision)).toContain(initial.revision)
    const old = await repo.version(initial.revision)
    await repo.save(old, saved.revision)
    expect((await repo.read()).library.points).toEqual([])
    expect((await repo.version(saved.revision)).points).toHaveLength(1)
  })

  it('serializes competing saves and rejects the outdated edit without data loss', async () => {
    const repo = (await repository()).create()
    const initial = await repo.read()
    const results = await Promise.allSettled([repo.save({ version: 1, points: [mixedPoint('first')] }, initial.revision), repo.save({ version: 1, points: [mixedPoint('second')] }, initial.revision)])
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { status: 409 } })
    expect((await repo.read()).library.points.map(({ id }) => id)).toEqual(['first'])
  })

  it('preserves the original file after invalid imports and blocks history traversal', async () => {
    const files = await repository()
    const repo = files.create()
    const before = await readFile(files.path, 'utf8')
    const { revision } = await repo.read()
    await expect(repo.save({ version: 1, points: [{ ...mixedPoint(), coordinate: { x: 1, y: 2, z: null } }] }, revision)).rejects.toThrow()
    expect(await readFile(files.path, 'utf8')).toBe(before)
    await expect(repo.version('../points')).rejects.toThrow('无效的历史版本')
  })

  it('preserves the last saved library on a failed disk replacement and allows retry', async () => {
    const files = await repository()
    const repo = files.create()
    const { revision } = await repo.read()
    const previous = await readFile(files.path, 'utf8')
    vi.mocked(rename).mockRejectedValueOnce(new Error('文件被占用，无法替换'))
    await expect(repo.save({ version: 1, points: [mixedPoint()] }, revision)).rejects.toThrow('无法替换')
    expect(await readFile(files.path, 'utf8')).toBe(previous)
    expect((await readdir(files.directory)).some((name) => name.endsWith('.tmp'))).toBe(false)
    await repo.save({ version: 1, points: [mixedPoint()] }, revision)
    expect((await repo.read()).library.points).toHaveLength(1)
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
