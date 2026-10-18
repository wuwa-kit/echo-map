import type { Plugin } from 'vite'
import { z } from 'zod'
import { createNavigationIconRepository } from './lib/navigation-icon-repository.ts'
import { isLocalEditorRequest } from './editor-plugin.ts'
import { projectPath } from './lib/files.ts'
import { PointRepositoryError } from './lib/point-repository.ts'

export function navigationIconPlugin(): Plugin {
  const repository = createNavigationIconRepository(projectPath('data/manual/navigation-icons.json'))
  const isEditableData = (file: string) => /\/data\/manual\/navigation-icons\.json$/u.test(file.replaceAll('\\', '/'))
  return {
    name: 'navigation-icon-library',
    configResolved(config) {
      for (let index = config.configFileDependencies.length - 1; index >= 0; index--) {
        if (isEditableData(config.configFileDependencies[index] ?? '')) config.configFileDependencies.splice(index, 1)
      }
    },
    handleHotUpdate(context) {
      if (isEditableData(context.file)) {
        for (const module of context.modules) context.server.moduleGraph.invalidateModule(module)
        return []
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0] ?? ''
        if (path !== '/api/icon-library') return next()
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        const run = async () => {
          if (!isLocalEditorRequest(request)) throw new PointRepositoryError('图标配置仅允许本机访问', 403)
          if (path === '/api/icon-library' && request.method === 'GET') return repository.read()
          if (path !== '/api/icon-library' || request.method !== 'PUT') throw new PointRepositoryError('不支持的请求方法', 405)
          if (!request.headers['content-type']?.startsWith('application/json')) throw new PointRepositoryError('需要 JSON 请求', 415)
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of request) {
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
            size += data.length
            if (size > 2 * 1024 * 1024) throw new PointRepositoryError('请求超过 2 MB', 413)
            chunks.push(data)
          }
          const body = z.object({ library: z.unknown(), revision: z.string() }).strict().parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          return repository.save(body.library, body.revision)
        }
        void run().then(body => response.end(JSON.stringify(body))).catch((error: unknown) => {
          response.statusCode = error instanceof PointRepositoryError ? error.status : 400
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : '图标操作失败' }))
        })
      })
    },
  }
}
