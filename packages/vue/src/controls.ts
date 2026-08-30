import type { PropType } from 'vue'
import { control } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

/**
 * Declarative wrappers for the map's controls.
 *
 * ```vue
 * <TsMap :center="[34.02, -118.47]" :zoom="14">
 *   <TsNavigationControl position="topright" show-compass />
 *   <TsGeocoderControl placeholder="Search for a place" />
 * </TsMap>
 * ```
 *
 * `LayersControl` is deliberately absent: it takes dictionaries of live layer
 * instances, which is imperative by nature. Use `useMap()` and
 * `control.layers(...)` for that one.
 */

export type ControlPosition = 'topleft' | 'topright' | 'bottomleft' | 'bottomright'

type ControlFactory = (options?: any) => { addTo: (map: any) => unknown, remove: () => unknown }

/**
 * Build a component from a control factory.
 *
 * `options` is watched deeply so a reactive options object updates the control,
 * which is rebuilt rather than mutated — controls read most of their options
 * once, when they build their DOM.
 */
function createControlComponent(factory: ControlFactory, name: string) {
  return defineComponent({
    name,
    props: {
      position: { type: String as PropType<ControlPosition>, default: undefined },
      options: { type: Object as PropType<Record<string, unknown>>, default: undefined },
    },
    setup(props) {
      const mapRef = useMap()
      let instance: ReturnType<ControlFactory> | null = null

      const detach = (): void => {
        instance?.remove()
        instance = null
      }

      const attach = (map: unknown): void => {
        if (!map)
          return
        detach()
        instance = factory({
          ...(props.position ? { position: props.position } : {}),
          ...props.options,
        })
        instance.addTo(map)
      }

      // Three watchers rather than one over a combined source, because only
      // `options` may be traversed deeply. A deep watch whose source list
      // includes the map would walk the entire map object graph — every pane,
      // layer and DOM node it holds — on each check.
      const stops = [
        watch(mapRef, map => attach(map), { immediate: true }),
        watch(() => props.position, () => attach(mapRef.value)),
        watch(() => props.options, () => attach(mapRef.value), { deep: true }),
      ]

      onBeforeUnmount(() => {
        for (const stop of stops) stop()
        detach()
      })

      return () => null
    },
  })
}

export const ZoomControl: ReturnType<typeof createControlComponent> = createControlComponent(control.zoom as ControlFactory, 'TsZoomControl')
export const NavigationControl: ReturnType<typeof createControlComponent> = createControlComponent(control.navigation as ControlFactory, 'TsNavigationControl')
export const GeocoderControl: ReturnType<typeof createControlComponent> = createControlComponent(control.geocoder as ControlFactory, 'TsGeocoderControl')
export const FullscreenControl: ReturnType<typeof createControlComponent> = createControlComponent(control.fullscreen as ControlFactory, 'TsFullscreenControl')
export const LocateControl: ReturnType<typeof createControlComponent> = createControlComponent(control.locate as ControlFactory, 'TsLocateControl')
export const ScaleControl: ReturnType<typeof createControlComponent> = createControlComponent(control.scale as ControlFactory, 'TsScaleControl')
export const AttributionControl: ReturnType<typeof createControlComponent> = createControlComponent(control.attribution as ControlFactory, 'TsAttributionControl')
