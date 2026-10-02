export const coordinateAxes = ['x', 'y', 'z'] as const
export type CoordinateAxis = typeof coordinateAxes[number]
export type CoordinateInputMode = 'combined' | 'axes'
export type CoordinateValue = Record<CoordinateAxis, number | null>
export interface CoordinateInputState {
  mode: CoordinateInputMode
  text: string | null
  textPending: boolean
  axes: Record<CoordinateAxis, string | null>
  axisPending: Record<CoordinateAxis, boolean>
  invalid: boolean
}
export interface CoordinateInputChange {
  state: CoordinateInputState
  value: CoordinateValue
  valid: boolean
}
export function emptyCoordinateInput(): CoordinateInputState {
  return { mode: 'combined', text: null, textPending: false, axes: { x: null, y: null, z: null }, axisPending: { x: false, y: false, z: false }, invalid: false }
}
export function coordinateInputPending(state: CoordinateInputState): boolean {
  return state.textPending || Object.values(state.axisPending).some(Boolean)
}
export function parseCoordinateInteger(text: string): number | null {
  if (!/^-?[0-9]+$/u.test(text)) return null
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : null
}

// Consume entire numeric-looking tokens so decimals, exponents and malformed signs
// cannot be split into multiple valid coordinates. Letters around a token are not delimiters.
export function extractCoordinateIntegers(text: string): CoordinateValue | null {
  const numbers: number[] = []
  const tokens = text.matchAll(/[+\-\d.]+(?:[eE][+\-\d.]*)?/gu)
  for (const token of tokens) {
    const start = token.index
    const end = start + token[0].length
    if (/[\p{L}\p{N}_]/u.test(text[start - 1] ?? '') || /[\p{L}\p{N}_]/u.test(text[end] ?? '')) continue
    const value = parseCoordinateInteger(token[0])
    if (value === null) continue
    numbers.push(value)
    if (numbers.length === 3) break
  }
  const [x, y, z] = numbers
  return x === undefined || y === undefined || z === undefined ? null : { x, y, z }
}

export function editCoordinateInput(state: CoordinateInputState, value: CoordinateValue, text: string, axis?: CoordinateAxis): CoordinateInputChange {
  if (!axis) return { state: { ...state, text, textPending: true, invalid: false }, value, valid: true }
  const parsed = parseCoordinateInteger(text)
  return {
    state: {
      ...state,
      axes: { ...state.axes, [axis]: text },
      axisPending: { ...state.axisPending, [axis]: parsed === null },
      text: state.textPending ? state.text : null,
      invalid: false,
    },
    value: parsed === null ? value : { ...value, [axis]: parsed },
    valid: parsed !== null,
  }
}

export function commitCoordinateInput(state: CoordinateInputState, value: CoordinateValue): CoordinateInputChange {
  if (state.mode === 'axes') {
    const valid = !Object.values(state.axisPending).some(Boolean)
    return { state: { ...state, invalid: !valid }, value, valid }
  }
  if (!state.textPending) return { state, value, valid: true }
  const parsed = extractCoordinateIntegers(state.text ?? '')
  if (!parsed) return { state: { ...state, invalid: true }, value, valid: false }
  return {
    state: {
      ...state, textPending: false, invalid: false,
      axes: { x: state.axisPending.x ? state.axes.x : null, y: state.axisPending.y ? state.axes.y : null, z: state.axisPending.z ? state.axes.z : null },
    },
    value: parsed, valid: true,
  }
}
export function switchCoordinateInput(state: CoordinateInputState, value: CoordinateValue, mode: CoordinateInputMode): CoordinateInputChange {
  const result = commitCoordinateInput(state, value)
  return { ...result, state: { ...result.state, mode, invalid: false } }
}
