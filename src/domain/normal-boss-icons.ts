import { mapNormalBossIcons, wikiBossIcons } from '../data/static-data.ts'

export const normalBossIcons = wikiBossIcons.map(icon => {
  const map = mapNormalBossIcons.find(item => item.replacesIconId === icon.id)
  const resource = map ?? icon
  return { id: resource.id, name: resource.name, url: resource.url, source: map ? 'map' as const : 'wiki' as const }
})
