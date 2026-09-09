import CircleStyle from 'ol/style/Circle.js'
import Fill from 'ol/style/Fill.js'
import Icon from 'ol/style/Icon.js'
import ImageState from 'ol/ImageState.js'
import { shared as iconImageCache } from 'ol/style/IconImageCache.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import Text from 'ol/style/Text.js'
import type { EchoDefinition, EchoMapLocation, NavigationPoint } from '../domain/types.ts'
import { echoMembers, NAVIGATION_NAMES } from '../domain/point-library.ts'
import { bossMarkerShape, createPortraitMarkerStyles, PORTRAIT_MARKER_SIZES } from './boss-marker.ts'
import { createEchoMarkerStyles } from './echo-marker.ts'

export function createPointMarkerStyles(onChange: () => void, options: {
  exportMode?: boolean
  pixelRatio?: number
} = {}) {
  const echoCosts = new Map<string, EchoDefinition['cost']>()
  const navigationStyleCache = new Map<string, Style[]>()
  const echoPortraitStyles = createPortraitMarkerStyles(onChange, options.pixelRatio)
  const echoGroupStyles = createEchoMarkerStyles(onChange, options.pixelRatio)
  const bossStyles = createPortraitMarkerStyles(onChange, options.pixelRatio)
  let echoDefinitions: readonly EchoDefinition[] = []
  let selectedEchoIds: ReadonlySet<string> | undefined

  function updateEchoes(echoes: readonly EchoDefinition[], activeEchoIds?: ReadonlySet<string>): void {
    echoDefinitions = echoes
    selectedEchoIds = activeEchoIds
    echoCosts.clear()
    for (const echo of echoes) echoCosts.set(echo.id, echo.cost)
  }

  function visibleMembers(location: EchoMapLocation) {
    return echoMembers(location).filter(({ echoId }) => !selectedEchoIds || selectedEchoIds.has(echoId))
  }

  function echo(location: EchoMapLocation): Style[] | undefined {
    if ('members' in location) return echoGroupStyles.get(visibleMembers(location), echoDefinitions).styles
    const cost = echoCosts.get(location.echoId)
    return cost === undefined ? undefined : echoPortraitStyles.getStyle({
      shape: 'diamond',
      size: PORTRAIT_MARKER_SIZES[cost],
      iconUrl: location.iconUrl,
      opacity: location.gameCoordinate !== null ? 1 : 0.82,
    }) ?? undefined
  }

  function echoCluster(locations: readonly EchoMapLocation[]): Style[] {
    return echoGroupStyles.get(locations.flatMap(visibleMembers), echoDefinitions, {
      shape: 'circle',
      showText: false,
    }).styles
  }

  function navigation(location: NavigationPoint): Style[] {
    const shape = bossMarkerShape(location)
    if (shape && location.iconUrl) {
      const styles = bossStyles.getStyle({
        shape,
        size: PORTRAIT_MARKER_SIZES[4],
        iconUrl: location.iconUrl,
        opacity: location.mode === 'fast-travel' ? 1 : 0.48,
      })
      if (styles) return styles
    }

    const key = `${location.typeId}:${location.kind}:${location.mode}:${location.iconUrl}`
    const cached = navigationStyleCache.get(key)
    if (cached) return cached
    if (options.exportMode && location.iconUrl && iconImageCache.get(location.iconUrl, null)?.getImageState() === ImageState.ERROR) {
      iconImageCache.set(location.iconUrl, null, null)
    }
    const isFastTravel = location.mode === 'fast-travel'
    const styles = [new Style({
      text: !location.iconUrl ? new Text({ text: NAVIGATION_NAMES[location.kind], offsetY: 18, font: '11px sans-serif', fill: new Fill({ color: '#cde8dc' }), stroke: new Stroke({ color: '#07120e', width: 3 }) }) : undefined,
      image: location.iconUrl
        ? new Icon({ src: location.iconUrl, crossOrigin: 'anonymous', scale: 0.28, opacity: isFastTravel ? 1 : 0.48 })
        : new CircleStyle({ radius: 6, fill: new Fill({ color: isFastTravel ? '#65f1c2' : 'rgba(151, 169, 162, 0.48)' }) }),
    })]
    navigationStyleCache.set(key, styles)
    return styles
  }

  function dispose(): void {
    echoPortraitStyles.dispose()
    echoGroupStyles.dispose()
    bossStyles.dispose()
    echoCosts.clear()
    navigationStyleCache.clear()
  }

  return {
    updateEchoes,
    echo,
    echoCluster,
    navigation,
    dispose,
    ready: async () => {
      await Promise.all([echoPortraitStyles.ready(), echoGroupStyles.ready(), bossStyles.ready(), ...[...navigationStyleCache.values()].flatMap((styles) => styles.flatMap((style) => {
        const image = style.getImage()?.getImage(1)
        return image instanceof HTMLImageElement ? [image.decode()] : []
      }))])
    },
  }
}
