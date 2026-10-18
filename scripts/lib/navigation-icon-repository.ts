import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { navigationIconLibrarySchema, validateIconLibraryUpdate } from '../../src/domain/navigation-icon-library.ts'
import { writeJson } from './files.ts'
import { PointRepositoryError } from './point-repository.ts'

export function createNavigationIconRepository(path: string) {
  let pending: Promise<unknown> = Promise.resolve()
  async function read() {
    const text = await readFile(path, 'utf8')
    return { library: navigationIconLibrarySchema.parse(JSON.parse(text)), revision: createHash('sha256').update(text).digest('hex') }
  }
  function save(value: unknown, revision: string) {
    const operation = pending.then(async () => {
      const current = await read()
      if (revision !== current.revision) throw new PointRepositoryError('仓库图标配置已被其他页面或文件修改，当前编辑已保留，请核对冲突后重新载入', 409)
      const library = validateIconLibraryUpdate(value, current.library)
      await writeJson(path, library)
      return read()
    })
    pending = operation.catch(() => {})
    return operation
  }
  return { read, save }
}
