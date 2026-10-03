import { readPointLibrary, writePointLibrary } from '../scripts/lib/point-files.ts'
import { pointLibraryChanges, projectPointSnapshotSchema } from '../src/domain/point-changes.ts'
import type { PointLibrary } from '../src/domain/types.ts'
import { mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { build, createServer } from 'vite'
import * as files from '../scripts/lib/files.ts'
import { writeMapDataset, writePublicPointData } from '../scripts/lib/map-data.ts'
import { convertOfficialPoints } from '../scripts/lib/official-point-library.ts'
import { pointEditorPlugin } from '../scripts/editor-plugin.ts'
import { referenceDataset, mixedPoint } from './fixtures/point-library.ts'
import { pointLibrarySchema, officialEchoPointDataSchema } from '../src/domain/schema.ts'
import { serializeJson } from '../src/utils/json.ts'

const publicFiles = [
  'catalog-data.json', 'custom-echo-points.json', 'custom-navigation-points.json', 'map-data.json',
  'official-echo-points.json',
]
const manual: PointLibrary = { version: 1, points: [mixedPoint()] }
const official = convertOfficialPoints(referenceDataset)
let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'echo-map-public-data-'))
  vi.spyOn(files, 'projectPath').mockImplementation((...parts) => join(root, ...parts))
  await writePointLibrary(files.projectPath('data', 'manual'), manual, referenceDataset, 'manual')
  await writePointLibrary(files.projectPath('data', 'generated', 'official-echo'), official, referenceDataset, 'official')
})

afterEach(async () => {
  vi.restoreAllMocks()
  if (!root.startsWith(join(tmpdir(), 'echo-map-public-data-'))) throw new Error('临时目录超出测试范围')
  await rm(root, { recursive: true, force: true })
})

describe('public data generation', () => {
  it('materializes all five compact JSON files when synchronizing the map', async () => {
    await writeMapDataset(referenceDataset)
    expect((await readdir(files.projectPath('public', 'data'))).sort()).toEqual(publicFiles)
    for (const name of publicFiles) {
      const text = await readFile(files.projectPath('public', 'data', name), 'utf8')
      expect(text).toBe(JSON.stringify(JSON.parse(text)))
      expect(text).not.toContain(':null')
    }
    expect(pointLibrarySchema.parse(await files.readJson(files.projectPath('public', 'data', 'custom-echo-points.json')))).toEqual({ version: 1, points: [mixedPoint()] })
    expect(await files.readJson(files.projectPath('public', 'data', 'custom-navigation-points.json'))).toEqual({ version: 1, points: [] })
    const source = await readPointLibrary(files.projectPath('data', 'generated', 'official-echo'), referenceDataset, 'official')
    const officialJson = await readFile(files.projectPath('public', 'data', 'official-echo-points.json'), 'utf8')
    expect(officialJson).not.toContain('"note"')
    expect(officialJson).not.toContain('"compositionStatus"')
    expect(officialEchoPointDataSchema.parse(await files.readJson(files.projectPath('public', 'data', 'official-echo-points.json')))).toMatchObject({
      library: { version: 1, points: source.points.filter(({ kind }) => kind === 'echo') },
    })
    expect(await readPointLibrary(files.projectPath('data', 'manual'), referenceDataset, 'manual')).toEqual(manual)
  })

  it('keeps unchanged public files untouched across repeated refreshes', async () => {
    await writeMapDataset(referenceDataset)
    const date = new Date('2000-01-01T00:00:00Z')
    for (const name of publicFiles) await utimes(files.projectPath('public', 'data', name), date, date)
    await Promise.all([writePublicPointData(), writePublicPointData()])
    for (const name of publicFiles) expect((await stat(files.projectPath('public', 'data', name))).mtimeMs).toBe(date.getTime())
  })

  it('serves saved points directly from source without writing generated files in development', async () => {
    await writeMapDataset(referenceDataset)
    for (const name of publicFiles.filter((name) => name.includes('points'))) await rm(files.projectPath('public', 'data', name))
    const server = await createServer({
      configFile: false, root, publicDir: join(root, 'public'), logLevel: 'silent',
      plugins: [pointEditorPlugin()], server: { host: '127.0.0.1', port: 0 },
    })
    try {
      await server.listen()
      const address = server.httpServer?.address()
      if (!address || typeof address === 'string') throw new Error('测试服务器未启动')
      const baseUrl = `http://127.0.0.1:${address.port}`
      const source = projectPointSnapshotSchema.parse(await (await fetch(`${baseUrl}/api/editor/library`)).json())
      const point = { ...mixedPoint(), note: '更新后的实测记录' }
      const response = await fetch(`${baseUrl}/api/editor/library`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: serializeJson({ changes: pointLibraryChanges(manual, { ...manual, points: [point] }), revision: source.revision }),
      })
      expect(response.status).toBe(200)
      expect(await readPointLibrary(files.projectPath('data', 'manual'), referenceDataset, 'manual')).toEqual({ version: 1, points: [point] })
      for (const name of publicFiles) {
        const result = await fetch(`${baseUrl}/data/${name}`)
        expect(result.status).toBe(200)
        if (name === 'custom-echo-points.json') {
          const text = await result.text()
          expect(text).not.toContain(':null')
          expect(pointLibrarySchema.parse(JSON.parse(text))).toEqual({ version: 1, points: [point] })
        }
        else if (name === 'custom-navigation-points.json') expect(await result.json()).toEqual({ version: 1, points: [] })
        else if (name === 'official-echo-points.json') expect(officialEchoPointDataSchema.parse(await result.json())).toMatchObject({ library: official })
        else expect(await result.text()).toBe(await readFile(files.projectPath('public', 'data', name), 'utf8'))
      }
      await writePointLibrary(files.projectPath('data', 'generated', 'official-echo'), { version: 1, points: [] }, referenceDataset, 'official')
      const result = await fetch(`${baseUrl}/data/official-echo-points.json`)
      expect(result.status).toBe(200)
      expect(await result.json()).toMatchObject({ library: { version: 1, points: [] } })
      expect((await readdir(files.projectPath('public', 'data'))).sort()).toEqual(['catalog-data.json', 'map-data.json'])
    } finally {
      await server.close()
    }
  })

  it('generates publishable point files during a build with no existing public snapshots', async () => {
    await writeMapDataset(referenceDataset)
    for (const name of publicFiles.filter((name) => name.includes('points'))) await rm(files.projectPath('public', 'data', name))
    await writeFile(join(root, 'index.html'), '<html><body>地图</body></html>')
    await build({ configFile: false, root, publicDir: join(root, 'public'), logLevel: 'silent', plugins: [pointEditorPlugin()] })
    expect((await readdir(files.projectPath('dist', 'data'))).sort()).toEqual(publicFiles)
    expect(pointLibrarySchema.parse(await files.readJson(files.projectPath('dist', 'data', 'custom-echo-points.json')))).toEqual(manual)
    expect(officialEchoPointDataSchema.parse(await files.readJson(files.projectPath('dist', 'data', 'official-echo-points.json')))).toMatchObject({ library: official })
  })
})
