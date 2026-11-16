import { z } from 'zod'
import { loadPublishedArchive } from './fetch-published-data.ts'

const iconSchema = z.object({ id: z.string(), name: z.string(), url: z.string() })
const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  icons: z.array(z.object({ iconId: z.string() })),
})

async function loadStaticData() {
  const archive = await loadPublishedArchive()
  return {
    iconLibraryJson: z.looseObject({ categories: z.array(categorySchema.loose()) }).parse(archive['navigation-icons.json']),
    wiki: z.object({ echoes: z.array(z.object({
      ...iconSchema.pick({ id: true, name: true }).shape,
      cost: z.number(),
      iconUrl: z.string(),
      sonataIds: z.array(z.string()),
    })) }).parse(archive['wiki.json']),
    weeklyBossIcons: z.array(iconSchema).parse(archive['map-boss-icons.json']),
    mapNormalBossIcons: z.array(iconSchema.extend({ replacesIconId: z.string() })).parse(archive['map-normal-boss-icons.json']),
    wikiBossIcons: z.array(iconSchema).parse(archive['wiki-boss-icons.json']),
    mapTileOverrides: z.record(z.string(), z.object({ url: z.string(), source: z.string() })).parse(archive['map-tile-overrides.json']),
    echoNotesJson: archive['echo-notes.json'],
  }
}

export const {
  iconLibraryJson,
  wiki,
  weeklyBossIcons,
  mapNormalBossIcons,
  wikiBossIcons,
  mapTileOverrides,
  echoNotesJson,
} = import.meta.env?.PROD ? await loadStaticData() : await import('./static-data-local.ts')
