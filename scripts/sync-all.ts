import { syncMap } from './sync-map.ts'
import { syncWiki } from './sync-wiki.ts'

const wiki = await syncWiki()
await syncMap(wiki)
