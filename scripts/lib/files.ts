import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serializeJson } from '../../src/utils/json.ts'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function projectPath(...parts: string[]): string {
  return resolve(projectRoot, ...parts)
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

export async function writeJson(path: string, value: unknown, options: { compact?: boolean, skipUnchanged?: boolean } = {}): Promise<void> {
  const text = options.compact ? serializeJson(value) : `${serializeJson(value, 2)}\n`
  if (options.skipUnchanged) {
    try {
      if (await readFile(path, 'utf8') === text) return
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
  }
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.tmp`
  await writeFile(temporaryPath, text, 'utf8')
  await rename(temporaryPath, path)
}

export function isMainModule(importMetaUrl: string): boolean {
  const entryPath = process.argv[1]
  return entryPath !== undefined && importMetaUrl === pathToFileURL(entryPath).href
}
