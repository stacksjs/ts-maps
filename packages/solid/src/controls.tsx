import type { JSX } from 'solid-js'
import { createEffect, onCleanup } from 'solid-js'
import { control } from 'ts-maps'
import { useMap } from './context'

/**
 * Declarative wrappers for the map's controls.
 *
 * ```tsx
 * <Map center={[34.02, -118.47]} zoom={14}>
 *   <NavigationControl position="topright" showCompass />
 *   <GeocoderControl placeholder="Search for a place" />
 * </Map>
 * ```
 *
 * `LayersControl` is deliberately absent: it takes dictionaries of live layer
 * instances, which is imperative by nature. Use `useMap()` and
 * `control.layers(...)` for that one.
 */

export type ControlPosition = 'topleft' | 'topright' | 'bottomleft' | 'bottomright'

export interface ControlProps {
  position?: ControlPosition
  /** Anything else the underlying control accepts. */
  options?: Record<string, unknown>
}

type ControlFactory = (options?: any) => { addTo: (map: any) => unknown, remove: () => unknown }

function createControlComponent<P extends ControlProps>(factory: ControlFactory) {
  return function Control(props: P): JSX.Element {
    let instance: ReturnType<ControlFactory> | null = null

    // An effect rather than onMount: the map arrives through a signal, so a
    // control mounted in the same tick as the map would otherwise find nothing
    // to attach to.
    createEffect(() => {
      const map = useMap()
      if (!map)
        return

      const { position, options, ...rest } = props
      instance?.remove()
      instance = factory({
        ...(position ? { position } : {}),
        ...rest,
        ...options,
      })
      instance.addTo(map)
    })

    onCleanup(() => {
      instance?.remove()
      instance = null
    })

    return null
  }
}

export interface NavigationControlProps extends ControlProps {
  showZoom?: boolean
  showCompass?: boolean
  visualizePitch?: boolean
  resetDuration?: number
}

export interface GeocoderControlProps extends ControlProps {
  placeholder?: string
  limit?: number
  debounce?: number
  minLength?: number
  collapsed?: boolean
  flyTo?: boolean
  zoom?: number
  marker?: boolean
  proximity?: boolean
}

export interface LocateControlProps extends ControlProps {
  zoom?: number | null
  follow?: boolean
  showMarker?: boolean
}

export const ZoomControl: (props: ControlProps) => JSX.Element = createControlComponent<ControlProps>(control.zoom as ControlFactory)
export const NavigationControl: (props: NavigationControlProps) => JSX.Element = createControlComponent<NavigationControlProps>(control.navigation as ControlFactory)
export const GeocoderControl: (props: GeocoderControlProps) => JSX.Element = createControlComponent<GeocoderControlProps>(control.geocoder as ControlFactory)
export const FullscreenControl: (props: ControlProps) => JSX.Element = createControlComponent<ControlProps>(control.fullscreen as ControlFactory)
export const LocateControl: (props: LocateControlProps) => JSX.Element = createControlComponent<LocateControlProps>(control.locate as ControlFactory)
export const ScaleControl: (props: ControlProps) => JSX.Element = createControlComponent<ControlProps>(control.scale as ControlFactory)
export const AttributionControl: (props: ControlProps) => JSX.Element = createControlComponent<ControlProps>(control.attribution as ControlFactory)
