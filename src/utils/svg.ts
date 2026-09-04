const svgModules = import.meta.glob<string>('../assets/svg/*.svg', {
  eager: true,
  query: 'raw',
  import: 'default',
})

const svgElements = Object.fromEntries(
  Object.entries(svgModules).map(([path, source]) => {
    const name = path.split('/').at(-1)?.replace(/\.svg$/, '')
    if (!name) {
      throw new Error(`无法从路径解析 SVG 名称：${path}`)
    }

    const template = document.createElement('template')
    template.innerHTML = source
    const element = template.content.firstElementChild
    if (!(element instanceof SVGSVGElement)) {
      throw new Error(`SVG 资源缺少有效根元素：${path}`)
    }
    return [name, element]
  }),
) as Record<string, SVGSVGElement>

export default svgElements
