export interface WuCascaderOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
  children?: readonly WuCascaderOption[]
}

export interface WuCascaderColumn {
  depth: number
  options: readonly WuCascaderOption[]
  parent?: WuCascaderOption
}

export function resolveCascaderPath(options: readonly WuCascaderOption[], values: readonly string[]): WuCascaderOption[] {
  const path: WuCascaderOption[] = []
  let siblings = options
  for (const value of values) {
    const option = siblings.find((item) => item.value === value && !item.disabled)
    if (!option?.children?.length) break
    path.push(option)
    siblings = option.children
  }
  return path
}

export function cascaderColumns(options: readonly WuCascaderOption[], path: readonly string[]): WuCascaderColumn[] {
  return [
    { depth: 0, options },
    ...resolveCascaderPath(options, path).map((parent, index) => ({
      depth: index + 1, options: parent.children ?? [], parent,
    })),
  ]
}

export function resolveCascaderChoice(
  options: readonly WuCascaderOption[],
  path: readonly string[],
  depth: number,
  value: string,
): { kind: 'expand' | 'select', option: WuCascaderOption, path: string[] } | null {
  const columns = cascaderColumns(options, path)
  const option = columns[depth]?.options.find((item) => item.value === value && !item.disabled)
  if (!option) return null
  return {
    kind: option.children?.length ? 'expand' : 'select',
    option,
    path: [...resolveCascaderPath(options, path).slice(0, depth).map((item) => item.value), option.value],
  }
}
