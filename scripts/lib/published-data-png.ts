import { crc32, deflateSync } from 'node:zlib'
import { publicDataFilenames, publishedDataTextHeader, staticDataSources } from '../../src/data/published-data-png.ts'
import type { PublicDataFilename } from '../../src/data/published-data-png.ts'
import { serializeJson } from '../../src/utils/json.ts'
import { projectPath, readJson } from './files.ts'
import { readPublicPointData } from './map-data.ts'

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function pngChunk(type: string, data = Buffer.alloc(0)): Buffer {
  const body = Buffer.concat([Buffer.from(type), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

export function encodePublishedDataPng(json: string, width = 1920, height = 1080): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 1 // 1 位灰度，颜色类型为 0。
  // 每行首字节为过滤类型 0，其余字节以每像素一位表示纯黑。
  const rows = Buffer.alloc((Math.ceil(width / 8) + 1) * height)
  const text = Buffer.concat([Buffer.from(publishedDataTextHeader), deflateSync(json, { level: 9 })])
  return Buffer.concat([
    pngSignature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('iTXt', text),
    pngChunk('IEND'),
  ])
}

export async function createPublishedDataPng(): Promise<Buffer> {
  const { officialEcho, manualEcho, manualNavigation } = await readPublicPointData()
  const pointSnapshots: Partial<Record<PublicDataFilename, string>> = {
    'official-echo-points.json': serializeJson(officialEcho),
    'custom-echo-points.json': serializeJson(manualEcho),
    'custom-navigation-points.json': serializeJson(manualNavigation),
  }
  const entries = await Promise.all([
    ...publicDataFilenames.map(async name => {
      const json = pointSnapshots[name] ?? JSON.stringify(await readJson<unknown>(projectPath('public', 'data', name)))
      return `${JSON.stringify(name)}:${json}`
    }),
    ...staticDataSources.map(async ([name, path]) => {
      const json = await readJson<unknown>(projectPath(path))
      return `${JSON.stringify(name)}:${JSON.stringify(json)}`
    }),
  ])
  return encodePublishedDataPng(`{${entries.join(',')}}`)
}
