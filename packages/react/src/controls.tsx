import type { ComponentType } from 'react'
import { useEffect, useRef } from 'react'
import { control } from 'ts-maps'
import { useMapOptional } from './useMap'

/**
 * Declarative wrappers for the map's controls.
 *
 * Controls were previously reachable only through `useMap()` and an effect,
 * which meant every app wrote the same add-on-mount / remove-on-unmount dance.
 * They are placed UI, so they belong in the tree with everything else:
 *
 * ```tsx
 * <Map center={[34.02, -118.47]} zoom={14}>
 *   <NavigationControl position="topright" showCompass />
 *   <GeocoderControl placeholder="Search for a place" />
 * </Map>
 * ```
 *
 * `LayersControl` is deliberately absent: it takes base-layer and overlay
 * dictionaries of live layer instances, which is imperative by nature. Reach
 * for `useMap()` and `control.layers(...)` for that one.
 */

export type ControlPosition = 'topleft' | 'topright' | 'bottomleft' | 'bottomright'

export interface ControlProps {
  position?: ControlPosition
  /** Anything else the underlying control accepts. */
  options?: Record<string, unknown>
}

type ControlFactory = (options?: any) => { addTo: (map: any) => unknown, remove: () => unknown }

/**
 * Build a component from a control factory.
 *
 * Options are read through a ref rather than listed in the dependency array so
 * an inline object literal — the normal way to write these props — does not
 * tear the control down and rebuild it on every render. Changing `position`
 * does rebuild, because that is what moving a control means.
 */
function createControlComponent<P extends ControlProps>(
  factory: ControlFactory,
  displayName: string,
): ComponentType<P> {
  function Control(props: P): null {
    const map = useMapOptional()
    const propsRef = useRef(props)
    propsRef.current = props

    useEffect(() => {
      if (!map)
        return

      const { position, options, ...rest } = propsRef.current
      const instance = factory({
        ...(position ? { position } : {}),
        ...rest,
        ...options,
      })
      instance.addTo(map)

      return () => {
        instance.remove()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, props.position])

    return null
  }

  Control.displayName = displayName
  return Control as ComponentType<P>
}

export interface ZoomControlProps extends ControlProps {
  zoomInTitle?: string
  zoomOutTitle?: string
}

export interface NavigationControlProps extends ControlProps {
  showZoom?: boolean
  showCompass?: boolean
  visualizePitch?: boolean
  resetDuration?: number
  compassTitle?: string
}

export interface GeocoderControlProps extends ControlProps {
  provider?: unknown
  placeholder?: string
  limit?: number
  debounce?: number
  minLength?: number
  collapsed?: boolean
  flyTo?: boolean
  zoom?: number
  marker?: boolean
  proximity?: boolean
  language?: string
  countries?: string[]
}

export interface FullscreenControlProps extends ControlProps {
  container?: HTMLElement
  title?: string
  titleCancel?: string
}

export interface LocateControlProps extends ControlProps {
  zoom?: number | null
  follow?: boolean
  showMarker?: boolean
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
}

export interface ScaleControlProps extends ControlProps {
  metric?: boolean
  imperial?: boolean
  maxWidth?: number
}

export interface AttributionControlProps extends ControlProps {
  prefix?: string | false
}

export const ZoomControl: ComponentType<ZoomControlProps>
  = createControlComponent<ZoomControlProps>(control.zoom as ControlFactory, 'ZoomControl')

export const NavigationControl: ComponentType<NavigationControlProps>
  = createControlComponent<NavigationControlProps>(control.navigation as ControlFactory, 'NavigationControl')

export const GeocoderControl: ComponentType<GeocoderControlProps>
  = createControlComponent<GeocoderControlProps>(control.geocoder as ControlFactory, 'GeocoderControl')

export const FullscreenControl: ComponentType<FullscreenControlProps>
  = createControlComponent<FullscreenControlProps>(control.fullscreen as ControlFactory, 'FullscreenControl')

export const LocateControl: ComponentType<LocateControlProps>
  = createControlComponent<LocateControlProps>(control.locate as ControlFactory, 'LocateControl')

export const ScaleControl: ComponentType<ScaleControlProps>
  = createControlComponent<ScaleControlProps>(control.scale as ControlFactory, 'ScaleControl')

export const AttributionControl: ComponentType<AttributionControlProps>
  = createControlComponent<AttributionControlProps>(control.attribution as ControlFactory, 'AttributionControl')
