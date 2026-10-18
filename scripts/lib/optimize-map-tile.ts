import { PNG } from 'pngjs'

export function optimizeMapTile(bytes: Buffer): Buffer {
  const image = PNG.sync.read(bytes)
  if (image.width !== 1024 || image.height !== 1024) throw new Error('地图分片需要 1024×1024 像素 PNG')
  let smallest = bytes
  for (const strategy of [0, 1, 2, 3]) {
    const encoded = PNG.sync.write(image, { deflateLevel: 9, deflateStrategy: strategy })
    if (encoded.length < smallest.length) smallest = encoded
  }
  return smallest
}
