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
