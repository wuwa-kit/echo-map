import { describe, expect, it } from 'vitest'
import { coordinateInputPreviewXY, coordinateInputXY, commitCoordinateInput, editCoordinateInput, emptyCoordinateInput, extractCoordinateIntegers, switchCoordinateInput } from '../src/components/base/coordinate-input.ts'

const value = { x: 1, y: 2, z: 3 }
describe('coordinate input', () => {
  it.each(['-497, 449,', '-497, 449 ', '-497，449，-', 'X: -497, Y: 449, Z:', '-497\n449\n18'])('previews XY after Y is delimited in %j without committing coordinates', (text) => {
    const edited = editCoordinateInput(emptyCoordinateInput(), value, text)
    expect(coordinateInputPreviewXY(edited.state, edited.value)).toEqual([-497, 449])
    expect(edited.value).toEqual(value)
  })
  it.each(['', '-497,', '-497, 449', '-497, 449.5,', '-497, 449e2,', '-497, 449x,'])('hides the preview for incomplete or invalid XY in %j instead of using saved coordinates', (text) => {
    const edited = editCoordinateInput(emptyCoordinateInput(), value, text)
    expect(coordinateInputPreviewXY(edited.state, edited.value)).toBeNull()
  })
  it('tracks edits, deletion, committed coordinates and separate axis input in the preview', () => {
    let edited = editCoordinateInput(emptyCoordinateInput(), value, '10, 20,')
    expect(coordinateInputPreviewXY(edited.state, edited.value)).toEqual([10, 20])
    edited = editCoordinateInput(edited.state, edited.value, '30, 40, -')
    expect(coordinateInputPreviewXY(edited.state, edited.value)).toEqual([30, 40])
    edited = editCoordinateInput(edited.state, edited.value, '30,')
    expect(coordinateInputPreviewXY(edited.state, edited.value)).toBeNull()
    expect(coordinateInputPreviewXY(emptyCoordinateInput(), value)).toEqual([1, 2])
    const axes = switchCoordinateInput(emptyCoordinateInput(), value, 'axes')
    const invalid = editCoordinateInput(axes.state, axes.value, '-', 'y')
    expect(coordinateInputPreviewXY(invalid.state, invalid.value)).toBeNull()
    const valid = editCoordinateInput(invalid.state, invalid.value, '50', 'y')
    expect(coordinateInputPreviewXY(valid.state, valid.value)).toEqual([1, 50])
  })
  it.each(['X: -497, Y: 449, Z: 18', '位置：(-497，449，18) 999', '-497\n449\n18'])('extracts the first three signed integers from %s', (text) => {
    expect(extractCoordinateIntegers(text)).toEqual({ x: -497, y: 449, z: 18 })
  })
  it.each(['1.5', '1e3', '1e-3', '--1', '+2', '9007199254740992', 'id12'])('does not split invalid token %s into integers', (token) => {
    expect(extractCoordinateIntegers(`${token}, 4, 5, 6`)).toEqual({ x: 4, y: 5, z: 6 })
  })
  it.each(['X: -497, Y: 449', '位置：(-497，449，18)', '-497\n449\n'])('uses the latest parsed XY for locating from %s', (text) => {
    const edited = editCoordinateInput(emptyCoordinateInput(), value, text)
    expect(coordinateInputXY(edited.state, edited.value)).toEqual([-497, 449])
    expect(edited.value).toEqual(value)
  })
  it('allows locating with XY while still requiring XYZ to commit the full coordinate', () => {
    const edited = editCoordinateInput(emptyCoordinateInput(), value, '0, -12')
    expect(coordinateInputXY(edited.state, edited.value)).toEqual([0, -12])
    expect(commitCoordinateInput(edited.state, edited.value).valid).toBe(false)
  })
  it.each(['', '-12,', '9007199254740992, 5', '1.5, 5', '--1, 5'])('does not locate stale XY when the latest input %j cannot provide two integers', (text) => {
    const edited = editCoordinateInput(emptyCoordinateInput(), value, text)
    expect(coordinateInputXY(edited.state, edited.value)).toBeNull()
  })
  it('allows locating from axes without Z but rejects pending X or Y', () => {
    const axes = switchCoordinateInput(emptyCoordinateInput(), { x: null, y: null, z: null }, 'axes')
    const x = editCoordinateInput(axes.state, axes.value, '0', 'x')
    expect(coordinateInputXY(x.state, x.value)).toBeNull()
    const y = editCoordinateInput(x.state, x.value, '-12', 'y')
    expect(coordinateInputXY(y.state, y.value)).toEqual([0, -12])
    const z = editCoordinateInput(y.state, y.value, '-', 'z')
    expect(coordinateInputXY(z.state, z.value)).toEqual([0, -12])
    for (const axis of ['x', 'y'] as const) {
      const pending = editCoordinateInput(z.state, z.value, '-', axis)
      expect(coordinateInputXY(pending.state, pending.value)).toBeNull()
    }
  })
  it('keeps incomplete combined text and coordinates while switching modes', () => {
    const edited = editCoordinateInput(emptyCoordinateInput(), value, '-12, ')
    const switched = switchCoordinateInput(edited.state, edited.value, 'axes')
    expect(switched.value).toEqual(value)
    expect(switched.state.text).toBe('-12, ')
    const axis = editCoordinateInput(switched.state, switched.value, '-', 'x')
    const back = switchCoordinateInput(axis.state, axis.value, 'combined')
    expect(back.state.axes.x).toBe('-')
    expect(back.state.text).toBe('-12, ')
    expect(commitCoordinateInput(back.state, back.value).valid).toBe(false)
  })
  it('commits a complete combined input and updates it after editing an axis', () => {
    const edited = editCoordinateInput(emptyCoordinateInput(), value, '-4, 5, 6')
    expect(edited.value).toEqual(value)
    const axes = switchCoordinateInput(edited.state, edited.value, 'axes')
    expect(axes.value).toEqual({ x: -4, y: 5, z: 6 })
    const changed = editCoordinateInput(axes.state, axes.value, '-9', 'z')
    expect(changed.value.z).toBe(-9)
    expect(changed.state.text).toBeNull()
  })

  it.each(['', '   '])('accepts an optional blank input %j and clears its previous coordinates', (text) => {
    const edited = editCoordinateInput(emptyCoordinateInput(), value, text)
    const committed = commitCoordinateInput(edited.state, edited.value, true)
    expect(committed.valid).toBe(true)
    expect(committed.state.invalid).toBe(false)
    expect(committed.state.textPending).toBe(false)
    expect(committed.value).toEqual({ x: null, y: null, z: null })
    expect(switchCoordinateInput(edited.state, edited.value, 'axes', true).value).toEqual(committed.value)
  })

  it('clears optional axes without restoring previous coordinates or flagging blank fields', () => {
    let changed = switchCoordinateInput(emptyCoordinateInput(), value, 'axes', true)
    for (const axis of ['x', 'y', 'z'] as const) {
      changed = editCoordinateInput(changed.state, changed.value, '', axis, true)
      expect(changed.valid).toBe(true)
      expect(changed.state.axisPending[axis]).toBe(false)
      expect(changed.value[axis]).toBeNull()
      changed = commitCoordinateInput(changed.state, changed.value, true)
      expect(changed.state.invalid).toBe(false)
    }
    expect(changed.value).toEqual({ x: null, y: null, z: null })
  })

  it.each(['4, 5,', '-', '4, 5, 1.5'])('still rejects incomplete optional coordinates %j', (text) => {
    const edited = editCoordinateInput(emptyCoordinateInput(), value, text)
    const committed = commitCoordinateInput(edited.state, edited.value, true)
    expect(committed.valid).toBe(false)
    expect(committed.state.invalid).toBe(true)
    expect(committed.value).toEqual(value)
  })

  it('keeps required coordinates invalid when cleared', () => {
    const edited = editCoordinateInput(emptyCoordinateInput(), value, '')
    expect(commitCoordinateInput(edited.state, edited.value).valid).toBe(false)
    const axes = switchCoordinateInput(emptyCoordinateInput(), value, 'axes')
    expect(editCoordinateInput(axes.state, axes.value, '', 'x').valid).toBe(false)
  })
})
