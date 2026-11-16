import { z } from 'zod'

export const publicDataFilenames = [
  'map-data.json',
  'catalog-data.json',
  'official-echo-points.json',
  'custom-echo-points.json',
  'custom-navigation-points.json',
  'map-asset-catalog.json',
] as const

export type PublicDataFilename = typeof publicDataFilenames[number]

export const staticDataSources = [
  ['navigation-icons.json', 'data/manual/navigation-icons.json'],
  ['wiki.json', 'data/generated/wiki.json'],
  ['map-boss-icons.json', 'data/generated/map-boss-icons.json'],
  ['map-normal-boss-icons.json', 'data/generated/map-normal-boss-icons.json'],
  ['wiki-boss-icons.json', 'data/generated/wiki-boss-icons.json'],
  ['map-tile-overrides.json', 'data/config/map-tile-overrides.json'],
  ['echo-notes.json', 'data/config/echo-notes.json'],
] as const

export const publishedDataFilenames = [...publicDataFilenames, ...staticDataSources.map(([name]) => name)]

export const publishedDataTextHeader = 'JSON\0\x01\0\0\0'

const archiveSchema = z.record(z.enum(publishedDataFilenames), z.unknown())
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]
const textHeader = new TextEncoder().encode(publishedDataTextHeader)

export async function readPublishedDataPng(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  if (!pngSignature.every((byte, index) => bytes[index] === byte)) throw new Error('发布数据不是有效的 PNG')

  for (let offset = pngSignature.length; offset + 12 <= bytes.length;) {
    const size = view.getUint32(offset)
    const dataStart = offset + 8
    const dataEnd = dataStart + size
    const end = dataEnd + 4
    if (end > bytes.length) throw new Error('发布数据 PNG 不完整')
    const type = String.fromCharCode(...bytes.subarray(offset + 4, dataStart))
    if (type === 'IEND') break
    if (type === 'iTXt' && size >= textHeader.length && textHeader.every((byte, index) => bytes[dataStart + index] === byte)) {
      const compressed = bytes.slice(dataStart + textHeader.length, dataEnd)
      const json = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'))
      return archiveSchema.parse(await new Response(json).json())
    }
    offset = end
  }
  throw new Error('发布数据 PNG 缺少压缩 JSON')
}
