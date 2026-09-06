import { mapDataSchema } from '../src/domain/schema.ts'
import { buildFloorCoverage } from './lib/map/floor-coverage.ts'
import { projectPath, readJson, writeJson } from './lib/files.ts'

// Rebuild coverage for the saved resource version without resynchronizing unrelated data.
const path = projectPath('public', 'data', 'map-data.json')
const map = mapDataSchema.parse(await readJson<unknown>(path))
const states = await buildFloorCoverage(map.states, map.source.mapResourceHash)
await writeJson(path, mapDataSchema.parse({ ...map, states }), { compact: true, skipUnchanged: true })
