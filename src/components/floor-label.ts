import type { LayeredMapDefinition, MapFloorDefinition } from '../domain/types.ts'

export function floorLabel(group: string, name: string): string {
  const parent = group.trim()
  const original = name.trim()
  if (!parent || original === parent) return original

  let label = original
  if (label.startsWith(parent)) {
    label = label.slice(parent.length).replace(/^[\s·]+/u, '')
  }
  if (label.endsWith(parent)) {
    label = label.slice(0, -parent.length).replace(/[\s·]+$/u, '')
  }
  return label || original
}

export function floorTooltipLabel(group: string, name: string): string {
  const parent = group.trim()
  const label = floorLabel(group, name)
  return !parent || label === parent ? label : `${parent} · ${label}`
}

export function floorSelectOptions(groups: readonly LayeredMapDefinition[], floors: readonly Pick<MapFloorDefinition, 'id' | 'name'>[]) {
  const parents = new Map(groups.flatMap(group => group.floors.map(floor => [floor.id, group.name] as const)))
  return floors.map(floor => ({
    id: floor.id,
    label: floorTooltipLabel(parents.get(floor.id) ?? '', floor.name),
  }))
}
