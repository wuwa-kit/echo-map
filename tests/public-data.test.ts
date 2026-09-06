import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'vite'
import * as files from '../scripts/lib/files.ts'
import { writeMapDataset, writePublicPointData } from '../scripts/lib/map-data.ts'
import { convertOfficialPoints } from '../scripts/lib/official-point-library.ts'
import { pointEditorPlugin } from '../scripts/editor-plugin.ts'
import { referenceDataset, mixedPoint } from './fixtures/point-library.ts'

const publicFiles = ['catalog-data.json', 'custom-points.json', 'map-data.json', 'official-points.json']
const manual = { version: 1, points: [mixedPoint(), { ...mixedPoint('draft'), status: 'draft' }] }
const official = convertOfficialPoints(referenceDataset)
let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'echo-map-public-data-'))
  vi.spyOn(files, 'projectPath').mockImplementation((...parts) => join(root, ...parts))
  await files.writeJson(files.projectPath('data', 'manual', 'points.json'), manual)
  await files.writeJson(files.projectPath('data', 'generated', 'official-points.json'), official)
})

afterEach(async () => {
  vi.restoreAllMocks()
  if (!root.startsWith(join(tmpdir(), 'echo-map-public-data-'))) throw new Error('临时目录超出测试范围')
  await rm(root, { recursive: true, force: true })
})

describe('public data generation', () => {
  it('materializes all four compact JSON files when synchronizing the map', async () => {
    await writeMapDataset(referenceDataset)
    expect((await readdir(files.projectPath('public', 'data'))).sort()).toEqual(publicFiles)
    for (const name of publicFiles) {
      const text = await readFile(files.projectPath('public', 'data', name), 'utf8')
      expect(text).toBe(JSON.stringify(JSON.parse(text)))
    }
    expect(await files.readJson(files.projectPath('public', 'data', 'custom-points.json'))).toEqual({ version: 1, points: [mixedPoint()] })
    expect(await files.readJson(files.projectPath('public', 'data', 'official-points.json'))).toMatchObject({
      library: await files.readJson(files.projectPath('data', 'generated', 'official-points.json')),
    })
    expect(await files.readJson(files.projectPath('data', 'manual', 'points.json'))).toEqual(manual)
  })

  it('keeps unchanged public files untouched across repeated refreshes', async () => {
    await writeMapDataset(referenceDataset)
    const date = new Date('2000-01-01T00:00:00Z')
    for (const name of publicFiles) await utimes(files.projectPath('public', 'data', name), date, date)
    await Promise.all([writePublicPointData(), writePublicPointData()])
    for (const name of publicFiles) expect((await stat(files.projectPath('public', 'data', name))).mtimeMs).toBe(date.getTime())
  })

  it('updates public snapshots after editor saves and removal of the optional official source', async () => {
    await writeMapDataset(referenceDataset)
    const server = await createServer({
      configFile: false, root, publicDir: join(root, 'public'), logLevel: 'silent',
      plugins: [pointEditorPlugin()], server: { host: '127.0.0.1', port: 0 },
    })
    try {
      await server.listen()
      const address = server.httpServer?.address()
      if (!address || typeof address === 'string') throw new Error('测试服务器未启动')
      const baseUrl = `http://127.0.0.1:${address.port}`
      const source = await readFile(files.projectPath('data', 'manual', 'points.json'), 'utf8')
      const point = { ...mixedPoint(), note: '更新后的实测记录' }
      const response = await fetch(`${baseUrl}/api/editor/library`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ library: { ...manual, points: [point, manual.points[1]] }, revision: createHash('sha256').update(source).digest('hex') }),
      })
      expect(response.status).toBe(200)
      expect(await files.readJson(files.projectPath('public', 'data', 'custom-points.json'))).toEqual({ version: 1, points: [point] })
      for (const name of publicFiles) {
        const result = await fetch(`${baseUrl}/data/${name}`)
        expect(result.status).toBe(200)
        expect(await result.text()).toBe(await readFile(files.projectPath('public', 'data', name), 'utf8'))
      }
      await rm(files.projectPath('data', 'generated', 'official-points.json'))
      const result = await fetch(`${baseUrl}/data/official-points.json`)
      expect(result.status).toBe(200)
      expect(await result.json()).toMatchObject({ library: { version: 1, points: [] } })
      expect(await files.readJson(files.projectPath('public', 'data', 'official-points.json'))).toMatchObject({ library: { version: 1, points: [] } })
    } finally {
      await server.close()
    }
  })
})
