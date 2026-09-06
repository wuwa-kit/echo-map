import { mapDatasetSchema } from '../src/domain/schema.ts'
import { convertOfficialPoints } from './lib/official-point-library.ts'
import { projectPath, readJson, writeJson } from './lib/files.ts'

const dataset = mapDatasetSchema.parse(await readJson<unknown>(projectPath('public', 'data', 'app-data.json')))
const library = convertOfficialPoints(dataset)
await writeJson(projectPath('data', 'generated', 'official-points.json'), library)
console.log(`已转换 ${library.points.length} 处官方点位，Z=0；人工点位文件未修改。`)
