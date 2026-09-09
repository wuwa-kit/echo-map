import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const echoFilterSourceUrl = new URL('../src/components/filters/EchoFilter.vue', import.meta.url)

describe('echo list filtering', () => {
  it('keeps search local to a stable list viewport and leaves candidate controls active', async () => {
    const source = await readFile(echoFilterSourceUrl, 'utf8')

    expect(source).toContain('>声骸目标</span>')
    expect(source).not.toContain('ECHO TARGETS')
    expect(source).toContain('placeholder="搜索当前声骸列表"')
    expect(source).toContain('{{ currentSelectedCount }} / {{ candidateEchoes.length }}')
    expect(source).toContain(':disabled="candidateEchoes.length === 0"')
    expect(source).toContain('store.selectCandidateEchoes()')
    expect(source).toContain('store.deselectCandidateEchoes()')
    expect(source).not.toContain('替换为当前结果')
    expect(source).not.toContain('replaceSelectedEchoesWithFiltered')
    expect(source).toContain('class="h-290px"')
    expect(source).toContain('v-for="echo in filteredEchoes"')
    expect(source).toContain('v-for="echo in selectedEchoes"')
    expect(source).toContain(':content="echo.name" placement="top"')
    expect(source).toContain('overflow-x-auto overscroll-x-contain')
    expect(source).toContain('@click="store.toggleEcho(echo.id)"')
    expect(source).not.toContain('已选 {{ selectedEchoes.length }}')
    expect(source).toContain('<div v-if="selectedEchoes.length"')
    expect(source).toContain(`v-if="echoSearch.trim() !== '' && filteredEchoes.length === 0"`)
    expect(source).toContain('未找到匹配的声骸')
    expect(source).not.toContain('没有匹配的声骸')
  })
})
