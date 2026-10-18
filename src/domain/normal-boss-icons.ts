import wikiIcons from '../../data/generated/wiki-boss-icons.json' with { type: 'json' }
import mapIcons from '../../data/generated/map-normal-boss-icons.json' with { type: 'json' }

export const normalBossIcons = wikiIcons.map(icon => {
  const map = mapIcons.find(item => item.replacesIconId === icon.id)
  const resource = map ?? icon
  return { id: resource.id, name: resource.name, url: resource.url, source: map ? 'map' as const : 'wiki' as const }
})
