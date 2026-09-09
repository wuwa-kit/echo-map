import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const mapCanvasSourceUrl = new URL('../src/components/MapCanvas.vue', import.meta.url)

describe('map canvas coordinate display', () => {
  it('always shows the most recently changed XY values', async () => {
    const source = await readFile(mapCanvasSourceUrl, 'utf8')

    expect(source).toContain('const lastGameCoordinate = shallowRef<[number, number]>([0, 0])')
    expect(source).toContain('lastGameCoordinate.value = [Math.round(x), Math.round(y)]')
    expect(source).toContain('updateLastCoordinate(map.getView().getCenter())')
    expect(source).toContain('return `${x} · ${y}`')
    expect(source).not.toContain('return `X ${x} · Y ${y}`')
    expect(source).not.toContain('@mouseleave=')
    expect(source).not.toContain('clearPointerCoordinate')
    expect(source).not.toContain('invisible: !pointerCoordinateText')
    expect(source).toContain('flex flex-col items-start gap-4px')
    expect(source).toContain("'left-[max(60px,env(safe-area-inset-left))]'")
  })
})
