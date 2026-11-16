import { readPointLibrary, writePointLibrary } from '../scripts/lib/point-files.ts'
import { pointLibraryChanges, projectPointSnapshotSchema } from '../src/domain/point-changes.ts'
import type { PointLibrary } from '../src/domain/types.ts'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { build, createServer } from 'vite'
import { PNG } from 'pngjs'
import * as files from '../scripts/lib/files.ts'
import { writeMapDataset, writePublicPointData } from '../scripts/lib/map-data.ts'
import { convertOfficialPoints } from '../scripts/lib/official-point-library.ts'
import { pointEditorPlugin } from '../scripts/editor-plugin.ts'
import { publishedDataPlugin } from '../scripts/published-data-plugin.ts'
import { readPublishedDataPng, staticDataSources } from '../src/data/published-data-png.ts'
import { createPublishedDataPng, encodePublishedDataPng } from '../scripts/lib/published-data-png.ts'
import { UPLOAD_ENDPOINT } from '../scripts/lib/navigation-icon-upload.ts'
import { uploadPublishedData } from '../scripts/upload-published-data.ts'
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

  it('publishes a verified CDN link locally and leaves the data package out of the build', async () => {
    await writeMapDataset(referenceDataset)
    await writeFile(files.projectPath('public', 'data', 'map-asset-catalog.json'), '{"assets":[]}')
    await Promise.all(staticDataSources.map(async ([, path]) => {
      const destination = join(root, path)
      await mkdir(dirname(destination), { recursive: true })
      await copyFile(new URL(`../${path}`, import.meta.url), destination)
    }))
    for (const name of publicFiles.filter((name) => name.includes('points'))) await rm(files.projectPath('public', 'data', name))
    const png = await createPublishedDataPng()
    const image = PNG.sync.read(png)
    expect([image.width, image.height]).toEqual([1920, 1080])
    expect(image.data.every((byte, index) => byte === (index % 4 === 3 ? 255 : 0))).toBe(true)
    const archive = await readPublishedDataPng(Uint8Array.from(png).buffer)
    for (const name of ['map-data.json', 'catalog-data.json', 'map-asset-catalog.json'] as const) {
      expect(archive[name]).toEqual(await files.readJson(files.projectPath('public', 'data', name)))
    }
    for (const [name, path] of staticDataSources) {
      expect(archive[name]).toEqual(await files.readJson(files.projectPath(path)))
    }
    expect(pointLibrarySchema.parse(archive['custom-echo-points.json'])).toEqual(manual)
    expect(officialEchoPointDataSchema.parse(archive['official-echo-points.json'])).toMatchObject({ library: official })

    const url = 'https://prod-alicdn-community.kurobbs.com/forum/published-data-test.png'
    const linkPath = files.projectPath('data', 'config', 'published-data-url.json')
    const previous = { url: url.replace('-test', '-previous') }
    await files.writeJson(linkPath, previous)
    let uploads = 0
    let downloaded = encodePublishedDataPng('{}')
    const request: typeof fetch = async (input, init) => {
      if (input === UPLOAD_ENDPOINT) {
        uploads++
        const form = init?.body
        const file = form instanceof FormData ? form.get('files') : null
        if (!(file instanceof File)) throw new Error('缺少上传文件')
        expect(Buffer.from(await file.arrayBuffer())).toEqual(png)
        return Response.json({ code: 200, data: { url } })
      }
      expect(input).toBe(url)
      expect(new Headers(init?.headers).get('origin')).toBe('https://wa.songe.li')
      return new Response(Uint8Array.from(downloaded), { headers: { 'access-control-allow-origin': '*' } })
    }
    const credentials = { token: 'test-token', devcode: 'test-device' }
    await expect(uploadPublishedData(credentials, request)).rejects.toThrow('与上传原件不一致')
    expect(await files.readJson(linkPath)).toEqual(previous)
    downloaded = png
    await expect(uploadPublishedData(credentials, request)).resolves.toEqual({ url, size: png.length })
    expect(await files.readJson(linkPath)).toEqual({ url })
    expect(uploads).toBe(1)

    await writeFile(join(root, 'index.html'), '<html><body>地图</body></html>')
    await build({ configFile: false, root, publicDir: join(root, 'public'), logLevel: 'silent', plugins: [pointEditorPlugin(), publishedDataPlugin()] })
    expect(await readdir(files.projectPath('dist', 'data'))).toEqual([])
    expect((await readdir(files.projectPath('public', 'data'))).sort()).toEqual(['catalog-data.json', 'map-asset-catalog.json', 'map-data.json'])
  })
})
