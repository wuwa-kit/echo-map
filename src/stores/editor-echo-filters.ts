import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useRouteQuery } from '@vueuse/router'
import { usePointEditorStore } from './point-editor.ts'

export const useEditorEchoFiltersStore = defineStore('editor-echo-filters', () => {
  const editor = usePointEditorStore()
  const sonataQuery = useRouteQuery<string>('editorSonatas', '', { mode: 'replace' })
  const costQuery = useRouteQuery<string>('editorCosts', '', { mode: 'replace' })
  const sonataIds = computed(() => Object.freeze([...new Set((typeof sonataQuery.value === 'string' ? sonataQuery.value : '').split(',').filter((id) => editor.dataset?.sonatas.some((sonata) => sonata.id === id)))]))
  const costs = computed(() => Object.freeze(([1, 3] as const).filter((cost) => (typeof costQuery.value === 'string' ? costQuery.value : '').split(',').includes(String(cost)))))
  function setSonatas(ids: readonly string[]): void {
    sonataQuery.value = [...new Set(ids.filter((id) => editor.dataset?.sonatas.some((sonata) => sonata.id === id)))].join(',')
  }
  function setCosts(values: readonly (1 | 3)[]): void {
    costQuery.value = ([1, 3] as const).filter((cost) => values.includes(cost)).join(',')
  }
  return { sonataIds, costs, setSonatas, setCosts }
})
