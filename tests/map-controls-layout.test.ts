import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const explorerViewSourceUrl = new URL('../src/views/ExplorerView.vue', import.meta.url)
const floorSwitcherSourceUrl = new URL('../src/components/FloorSwitcher.vue', import.meta.url)
const cascaderSourceUrl = new URL('../src/components/base/WuCascader.vue', import.meta.url)
const mapNavigationSourceUrl = new URL('../src/components/MapNavigationCascader.vue', import.meta.url)
const gravitySwitcherSourceUrl = new URL('../src/components/GravitySwitcher.vue', import.meta.url)

describe('map corner controls layout', () => {
  it('uses compact and consistent spacing', async () => {
    const [explorerSource, floorSource, gravitySource] = await Promise.all([
      readFile(explorerViewSourceUrl, 'utf8'),
      readFile(floorSwitcherSourceUrl, 'utf8'),
      readFile(gravitySwitcherSourceUrl, 'utf8'),
    ])

    expect(explorerSource).toContain('left-[max(8px,var(--safe-left))] top-[max(8px,var(--safe-top))]')
    expect(explorerSource).toContain('z-90 flex items-start gap-4px')
    expect(explorerSource).toContain('<GravitySwitcher :compact="compact" :selected-gravity="store.selectedGravity" :supports-gravity="store.supportsGravity" @gravity-selected="store.selectGravity" />')
    expect(explorerSource).toContain('[--wu-cascader-height:40px] [--wu-cascader-gap:6px] [--wu-cascader-padding:11px]')
    expect(gravitySource).toContain('<button\n    v-if="supportsGravity"')
    expect(gravitySource).not.toContain('WuTooltip')
    expect(gravitySource).not.toContain('当前普通重力')
    expect(gravitySource).toContain('<span>重力</span>')
    expect(gravitySource).toContain('name="gravity-direction"')
    expect(gravitySource).toContain("selectedGravity === 2 ? 'rotate-180' : ''")
    expect(gravitySource).toContain("emit('gravitySelected', props.selectedGravity === 1 ? 2 : 1)")
    expect(floorSource).toContain("compactFloors ? 'h-36px' : 'h-40px'")
    expect(floorSource).toContain("compactFloors ? 'h-36px justify-center' : 'h-40px gap-6px px-10px'")
    expect(floorSource).toContain('h-24px flex items-center bg-[#10231c] px-8px text-11px')
    expect(floorSource).toContain("compactFloors ? 'h-22px w-22px rotate-45 border-2' : 'h-18px w-18px'")
    expect(floorSource).toContain("compactFloors ? 'left-full top-0 h-36px w-24px")
    expect(floorSource).toContain('class="text-16px"')
  })

  it('keeps the map navigation popover compact and content-sized', async () => {
    const [cascaderSource, mapNavigationSource] = await Promise.all([
      readFile(cascaderSourceUrl, 'utf8'),
      readFile(mapNavigationSourceUrl, 'utf8'),
    ])

    expect(mapNavigationSource).toContain(':show-header="false" :show-path="false"')
    expect(mapNavigationSource).toContain(':placeholder="currentRegionName"')
    expect(mapNavigationSource).toContain(':popover-gap="4" :popover-viewport-margin="8"')
    expect(cascaderSource).toContain("props.compact ? 'content'")
    expect(cascaderSource).toContain("compact ? 'w-max min-w-112px max-w-180px")
    expect(cascaderSource).toContain("compact ? 'p-3px' : 'p-5px'")
    expect(cascaderSource).toContain("compact ? 'min-h-40px gap-5px rounded-5px px-8px py-5px'")
  })
})
