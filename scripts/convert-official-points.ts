import { convertOfficialPoints } from './lib/official-point-library.ts'
import { projectPath, writeJson } from './lib/files.ts'
import { readMapDataset, writePublicPointData } from './lib/map-data.ts'

const dataset = await readMapDataset()
const library = convertOfficialPoints(dataset)
await writeJson(projectPath('data', 'generated', 'official-points.json'), library)
await writePublicPointData(dataset)
console.log(`已转换 ${library.points.length} 处官方点位，Z=0；人工点位文件未修改。`)
