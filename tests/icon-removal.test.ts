import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNavigationIconRepository } from '../scripts/lib/navigation-icon-repository.ts'
import { readPointFiles, writePointLibrary } from '../scripts/lib/point-files.ts'
import { initialNavigationIconLibrary } from '../src/domain/navigation-icon-catalog.ts'
import type { AuthoredNavigationPoint } from '../src/domain/types.ts'
import { referenceDataset } from './fixtures/point-library.ts'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
const iconId = 'unpack-map-2-2-1'
const replacementId = 'unpack-map-3-3-4'
async function setup(referenced = true) {
  const root = await mkdtemp(join(tmpdir(), 'icon-removal-'))
  directories.push(root)
  const path = join(root, 'navigation-icons.json')
  const library = { ...initialNavigationIconLibrary, categories: [{ id: 'category-test', name: '测试', icons: [{ iconId }, { iconId: replacementId }] }] }
  await writeFile(path, JSON.stringify(library))
  const point: AuthoredNavigationPoint = { gravityType: null, levelId: null, id: 'referenced', kind: 'navigation', name: '入口', stateId: 8, coordinate: { x: -497, y: 449, z: 18 }, navigationKind: 'landmark', mode: 'landmark', iconId }
  await writePointLibrary(root, { version: 1, points: referenced ? [point] : [] }, referenceDataset, 'manual')
  const repo = createNavigationIconRepository(path, async () => referenceDataset)
  const initial = await repo.read()
  const removed = { ...library, categories: [{ id: 'category-test', name: '测试', icons: [{ iconId: replacementId }] }] }
  return { root, path, repo, initial, removed }
}

it.each([replacementId, 'icon-not-found'])('replaces references with %s and removes membership together', async replacementId => {
  const { root, repo, initial, removed } = await setup()
  await repo.save(removed, initial.revision, [{ iconId, replacementId, pointIds: ['referenced'] }])
  expect((await readPointFiles(root, referenceDataset, 'manual')).library.points[0]).toMatchObject({ iconId: replacementId, coordinate: { x: -497, y: 449, z: 18 }, mode: 'landmark' })
  if (replacementId === 'icon-not-found') expect((await readPointFiles(root, referenceDataset, 'manual')).library.points[0]).toMatchObject({ pointType: 'unclassified', navigationKind: 'landmark' })
  expect((await repo.read()).library.categories[0]?.icons).toEqual(removed.categories[0]?.icons)
})

it('rejects missing decisions, stale references and replacements outside the original category without writing', async () => {
  const { root, path, repo, initial, removed } = await setup()
  const before = await readFile(path, 'utf8')
  await expect(repo.save(removed, initial.revision)).rejects.toThrow('点位引用')
  await expect(repo.save(removed, initial.revision, [{ iconId, replacementId, pointIds: [] }])).rejects.toThrow('引用已变化')
  await expect(repo.save(removed, initial.revision, [{ iconId, replacementId: 'unpack-map-3-3-2', pointIds: ['referenced'] }])).rejects.toThrow('本分类')
  expect(await readFile(path, 'utf8')).toBe(before)
  expect((await readPointFiles(root, referenceDataset, 'manual')).library.points[0]).toMatchObject({ iconId })
})

it('allows an unused icon to leave and a referenced icon to move to another category', async () => {
  const unused = await setup(false)
  await unused.repo.save(unused.removed, unused.initial.revision)
  const used = await setup()
  await used.repo.save({ ...used.removed, categories: [...used.removed.categories, { id: 'category-other', name: '其它分类', icons: [{ iconId }] }] }, used.initial.revision)
  expect((await readPointFiles(used.root, referenceDataset, 'manual')).library.points[0]).toMatchObject({ iconId })
})
