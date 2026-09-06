import { readFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { z } from 'zod'
import type { Plugin } from 'vite'
import { mapDatasetSchema } from '../src/domain/schema.ts'
import { createPointRepository, PointRepositoryError } from './lib/point-repository.ts'
import { projectPath } from './lib/files.ts'
import { readOfficialPointLibrary } from './lib/official-point-library.ts'

export function isLocalEditorRequest(request: Pick<IncomingMessage, 'headers'> & { socket: { remoteAddress?: string } }): boolean {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) return false
  try {
    const host = new URL(`http://${request.headers.host ?? ''}`)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)) return false
    return !request.headers.origin || new URL(request.headers.origin).host === host.host
  } catch {
    return false
  }
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new PointRepositoryError('需要 JSON 请求', 415)
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    length += buffer.length
    if (length > 10 * 1024 * 1024) throw new PointRepositoryError('导入文件超过 10 MB', 413)
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function pointEditorPlugin(): Plugin {
  const getDataset = async () => mapDatasetSchema.parse(JSON.parse(await readFile(projectPath('public', 'data', 'app-data.json'), 'utf8')))
  const repository = createPointRepository(projectPath('data', 'manual', 'points.json'), projectPath('data', 'cache', 'point-history'), getDataset)
  const officialLibrary = async () => readOfficialPointLibrary(projectPath('data', 'generated', 'official-points.json'), await getDataset())
  return {
    name: 'point-editor',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0] ?? ''
        if (!['/data/points.json', '/data/official-points.json'].includes(path) && !path.startsWith('/api/editor/')) return next()
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        const run = async () => {
          if (path === '/data/official-points.json' && request.method === 'GET') return officialLibrary()
          if (path === '/data/points.json' && request.method === 'GET') {
            const { library } = await repository.read()
            return { ...library, points: library.points.filter(({ status }) => status === 'verified') }
          }
          if (!isLocalEditorRequest(request)) throw new PointRepositoryError('录入系统仅允许通过本机 localhost 访问', 403)
          if (path === '/api/editor/library' && request.method === 'GET') return repository.read()
          if (path === '/api/editor/library' && request.method === 'PUT') {
            const body = z.object({ library: z.unknown(), revision: z.string().regex(/^[a-f0-9]{64}$/u) }).strict().parse(await requestBody(request))
            return repository.save(body.library, body.revision)
          }
          if (path === '/api/editor/versions' && request.method === 'GET') return repository.versions()
          if (path.startsWith('/api/editor/versions/') && request.method === 'GET') return repository.version(path.slice('/api/editor/versions/'.length))
          throw new PointRepositoryError('不存在的录入接口', 404)
        }
        void run().then((body) => response.end(JSON.stringify(body))).catch((error: unknown) => {
          response.statusCode = error instanceof PointRepositoryError ? error.status : 400
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : '点位操作失败' }))
        })
      })
    },
    async generateBundle() {
      const { library } = await repository.read()
      this.emitFile({ type: 'asset', fileName: 'data/points.json', source: JSON.stringify({ ...library, points: library.points.filter(({ status }) => status === 'verified') }) })
      this.emitFile({ type: 'asset', fileName: 'data/official-points.json', source: JSON.stringify(await officialLibrary()) })
    },
  }
}
