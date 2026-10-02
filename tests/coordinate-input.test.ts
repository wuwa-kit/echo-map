import { describe, expect, it } from 'vitest'
import { commitCoordinateInput, editCoordinateInput, emptyCoordinateInput, extractCoordinateIntegers, switchCoordinateInput } from '../src/components/base/coordinate-input.ts'

const value = { x: 1, y: 2, z: 3 }
describe('coordinate input', () => {
  it.each(['X: -497, Y: 449, Z: 18', '位置：(-497，449，18) 999', '-497\n449\n18'])('extracts the first three signed integers from %s', (text) => {
    expect(extractCoordinateIntegers(text)).toEqual({ x: -497, y: 449, z: 18 })
  })
  it.each(['1.5', '1e3', '1e-3', '--1', '+2', '9007199254740992', 'id12'])('does not split invalid token %s into integers', (token) => {
    expect(extractCoordinateIntegers(`${token}, 4, 5, 6`)).toEqual({ x: 4, y: 5, z: 6 })
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
})
