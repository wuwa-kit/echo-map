import { pointFileRevisionsSchema, pointLibraryChangesSchema } from '../src/domain/point-changes.ts'
import type { IncomingMessage } from 'node:http'
import { z } from 'zod'
import type { Plugin } from 'vite'
import { createPointRepository, PointRepositoryError } from './lib/point-repository.ts'
import { projectPath } from './lib/files.ts'
import { readMapDataset, readPublicPointData, writePublicPointData } from './lib/map-data.ts'
import { serializeJson } from '../src/utils/json.ts'

const publicPointPaths = [
  '/data/official-echo-points.json',
  '/data/custom-echo-points.json',
  '/data/custom-navigation-points.json',
] as const

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
  const getDataset = readMapDataset
  const repository = createPointRepository(projectPath('data', 'manual'), projectPath('data', 'cache', 'point-history'), getDataset)
  let build = false
  return {
    name: 'point-editor',
    configResolved(config) {
      build = config.command === 'build'
    },
    async buildStart() {
      if (build) await writePublicPointData()
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0] ?? ''
        if (!publicPointPaths.some((candidate) => candidate === path) && !path.startsWith('/api/editor/')) return next()
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        const run = async () => {
          if (publicPointPaths.some((candidate) => candidate === path) && request.method === 'GET') {
            const data = await readPublicPointData()
            if (path === '/data/official-echo-points.json') return data.officialEcho
            if (path === '/data/custom-echo-points.json') return data.manualEcho
            return data.manualNavigation
          }
          if (!isLocalEditorRequest(request)) throw new PointRepositoryError('录入系统仅允许通过本机 localhost 访问', 403)
          if (path === '/api/editor/library' && request.method === 'GET') return repository.read()
          if (path === '/api/editor/library' && request.method === 'PUT') {
            const body = z.object({ changes: pointLibraryChangesSchema, revision: pointFileRevisionsSchema }).strict().parse(await requestBody(request))
            return repository.save(body.changes, body.revision)
          }
          if (path === '/api/editor/versions' && request.method === 'GET') return repository.versions()
          if (path.startsWith('/api/editor/versions/') && request.method === 'GET') return repository.version(path.slice('/api/editor/versions/'.length))
          throw new PointRepositoryError('不存在的录入接口', 404)
        }
        void run().then((body) => response.end(serializeJson(body))).catch((error: unknown) => {
          response.statusCode = error instanceof PointRepositoryError ? error.status : 400
          response.end(serializeJson({ error: error instanceof Error ? error.message : '点位操作失败' }))
        })
      })
    },
  }
}
