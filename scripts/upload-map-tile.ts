import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { mapTileOverridesSchema } from '../src/domain/schema.ts'
import { projectPath, readJson, writeJson } from './lib/files.ts'
import { readMapDataset } from './lib/map-data.ts'
import { readUploadCredentials, uploadPngImage } from './lib/navigation-icon-upload.ts'
import { optimizeMapTile } from './lib/optimize-map-tile.ts'

const [tileId, input, source] = process.argv.slice(2)
if (!tileId || !input || !source) throw new Error('用法：node scripts/upload-map-tile.ts <分片 ID> <PNG 文件> <来源 URL>')
mapTileOverridesSchema.parse({ [tileId]: { url: 'https://example.com/image.png', source } })
const dataset = await readMapDataset()
if (!dataset.states.some(state => state.tileIds.includes(tileId))) throw new Error(`替换分片不存在：${tileId}`)
const configPath = projectPath('data', 'config', 'map-tile-overrides.json')
mapTileOverridesSchema.parse(await readJson<unknown>(configPath))
const bytes = optimizeMapTile(await readFile(resolve(input)))
const cache = projectPath('.local', 'map-tile-upload')
await mkdir(cache, { recursive: true })
await writeFile(resolve(cache, `${tileId}-1024.png`), bytes)
const url = await uploadPngImage(bytes, await readUploadCredentials(), cache)
const config = mapTileOverridesSchema.parse(await readJson<unknown>(configPath))
await writeJson(configPath, mapTileOverridesSchema.parse({ ...config, [tileId]: { url, source } }))
console.log(`${tileId}: 1024×1024, ${bytes.length} bytes, ${url}`)
