import { describe, expect, it } from 'vitest'
import { serializeJson } from '../src/utils/json.ts'
import { libraryLocations, parsePointLibrary } from '../src/domain/point-library.ts'
import { mapDatasetSchema, mapDisplayPolicySchema } from '../src/domain/schema.ts'
import { mixedPoint, referenceDataset } from './fixtures/point-library.ts'

describe('JSON serialization without null object fields', () => {
  it('omits nested null fields while preserving values and array positions', () => {
    const value = { missing: null, '': null, zero: 0, no: false, text: '', empty: {}, list: [null, { absent: null, value: 0 }, null] }
    expect(serializeJson(value)).toBe('{"zero":0,"no":false,"text":"","empty":{},"list":[null,{"value":0},null]}')
    expect(value).toHaveProperty('missing', null)
    expect(value.list[1]).toEqual({ absent: null, value: 0 })
    expect(serializeJson(null)).toBe('null')
    expect(serializeJson([null, null])).toBe('[null,null]')
    expect(serializeJson({ omitted: null, value: 1 }, 2)).toBe('{\n  "value": 1\n}')
    expect(() => serializeJson(undefined)).toThrow('序列化')
  })

  it('restores omitted point metadata without accepting incomplete saved points', () => {
    const point = mixedPoint()
    const library = { version: 1, points: [point] }
    const json = serializeJson(library)
    expect(json).not.toContain('countryId')
    expect(json).not.toContain('levelId')
    expect(json).not.toContain('gravityType')
    expect(parsePointLibrary(JSON.parse(json), referenceDataset, 'manual')).toEqual(library)
    const incomplete = { ...point, coordinate: { x: 0, y: null, z: null } }
    const input: unknown = JSON.parse(serializeJson(incomplete))
    expect(input).toHaveProperty('coordinate', { x: 0 })
    expect(() => parsePointLibrary({ version: 1, points: [input] }, referenceDataset, 'manual')).toThrow('完整的整数 XYZ')
  })

  it('restores nullable map fields and resident policy after serialization', () => {
    expect(mapDatasetSchema.parse(JSON.parse(serializeJson(referenceDataset)))).toEqual(referenceDataset)
    expect(mapDisplayPolicySchema.parse(JSON.parse(serializeJson({ kind: 'always' })))).toEqual({ kind: 'always' })
  })

  it('keeps omitted notes absent in saved data while preserving authored notes and runtime defaults', () => {
    const { note: _note, ...point } = mixedPoint()
    const library = parsePointLibrary({ version: 1, points: [point] }, referenceDataset, 'manual')
    expect(library.points[0]).not.toHaveProperty('note')
    expect(serializeJson(library)).not.toContain('"note"')
    expect(libraryLocations(library, referenceDataset).echoLocations[0]).toMatchObject({ note: '', compositionStatus: 'partial' })
    const recorded = { ...point, note: '入口在瀑布后面', compositionStatus: 'complete' }
    const saved = parsePointLibrary({ version: 1, points: [recorded] }, referenceDataset, 'manual')
    expect(parsePointLibrary(JSON.parse(serializeJson(saved)), referenceDataset, 'manual').points[0]).toEqual(recorded)
  })
})
