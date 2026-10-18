import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import Projection from 'ol/proj/Projection.js'
import { mapTileOverrides, officialTileUrl, tilePreviewUrl } from '../src/data/official-asset-urls.ts'
import { mapTileOverridesSchema } from '../src/domain/schema.ts'
import { createOfficialTileLayer } from '../src/map/official-source.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'
import { optimizeMapTile } from '../scripts/lib/optimize-map-tile.ts'
import { buildOfficialAssets } from '../src/domain/official-assets.ts'

describe('map tile overrides', () => {
  it.each([[512, 512], [2048, 2048], [1024, 512]])('rejects %s×%s instead of resampling it', (width, height) => {
    const image = new PNG({ width, height })
    expect(() => optimizeMapTile(PNG.sync.write(image))).toThrow('1024×1024')
  })
  it('optimizes without changing resolution or pixels, including transparent RGB', () => {
    const input = new PNG({ width: 1024, height: 1024 })
    input.data.set([7, 11, 13, 0, 255, 128, 64, 255])
    const original = PNG.sync.write(input)
    const bytes = optimizeMapTile(original)
    const result = PNG.sync.read(bytes)
    expect([result.width, result.height]).toEqual([1024, 1024])
    expect(result.data.equals(input.data)).toBe(true)
    expect(bytes.length).toBeLessThanOrEqual(original.length)
  })
  it('uses the replacement in the real tile source and asset catalogue without resizing its URL', async () => {
    const dataset = await readMapDataset()
    const state = dataset.states.find(state => state.id === 912)
    if (!state) throw new Error('缺少梦枢天罗')
    const replacement = mapTileOverrides['912_1_1']
    if (!replacement) throw new Error('缺少替换配置')
    const layer = createOfficialTileLayer(state, dataset.source)
    const source = layer.getSource()
    if (!source) throw new Error('缺少瓦片源')
    const coordinate = [0, 1 - state.tileExtent.minTileX, state.tileExtent.maxTileY - 1]
    const projection = new Projection({ code: 'KURO:CRS-SIMPLE', units: 'pixels' })
    expect(source.getTileUrlFunction()(coordinate, 1, projection)).toBe(replacement.url)
    expect(tilePreviewUrl(replacement.url, 1024)).toBe(replacement.url)
    const asset = buildOfficialAssets(dataset).find(asset => asset.referenceIds.includes('912_1_1'))
    expect(asset).toMatchObject({ url: replacement.url, previewUrl: replacement.url, sourceUrl: replacement.source })
    expect(officialTileUrl('hash', 912, '912_0_1')).toContain('/hash/912/912_0_1.png')
    source.dispose()
    layer.dispose()
  })

  it('rejects malformed coordinates and unsafe URLs', () => {
    expect(mapTileOverridesSchema.safeParse({ '912_1_1_1': { url: 'https://example.com/a.png', source: 'https://example.com' } }).success).toBe(false)
    expect(mapTileOverridesSchema.safeParse({ '912_1_1': { url: 'http://example.com/a.png', source: 'https://example.com' } }).success).toBe(false)
  })

})
