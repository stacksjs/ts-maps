import type { TsMap as TsMapInstance } from 'ts-maps'
import type { PropType, Ref } from 'vue'
import { TsMap } from 'ts-maps'
import { defineComponent, h, onBeforeUnmount, onMounted, provide, shallowRef, watch } from 'vue'
import { mapKey } from './provideKey'

type MapEventName
  = | 'click'
    | 'dblclick'
    | 'mousedown'
    | 'mouseup'
    | 'mouseover'
    | 'mouseout'
    | 'mousemove'
    | 'contextmenu'
    | 'focus'
    | 'blur'
    | 'preclick'
    | 'load'
    | 'unload'
    | 'viewreset'
    | 'move'
    | 'movestart'
    | 'moveend'
    | 'drag'
    | 'dragstart'
    | 'dragend'
    | 'zoom'
    | 'zoomstart'
    | 'zoomend'
    | 'zoomlevelschange'
    | 'resize'
    | 'layeradd'
    | 'layerremove'
    | 'baselayerchange'
    | 'overlayadd'
    | 'overlayremove'
    | 'popupopen'
    | 'popupclose'
    | 'tooltipopen'
    | 'tooltipclose'
    | 'style-load'
    | 'styledataloading'

const FORWARDED_EVENTS: readonly MapEventName[] = [
  'click',
  'dblclick',
  'contextmenu',
  'focus',
  'blur',
  'preclick',
  'load',
  'unload',
  'viewreset',
  'move',
  'movestart',
  'moveend',
  'drag',
  'dragstart',
  'dragend',
  'zoom',
  'zoomstart',
  'zoomend',
  'zoomlevelschange',
  'resize',
  'layeradd',
  'layerremove',
  'baselayerchange',
  'overlayadd',
  'overlayremove',
  'popupopen',
  'popupclose',
  'tooltipopen',
  'tooltipclose',
  'styledataloading',
]

/**
 * Root component — creates a `TsMap` on mount, provides it via `mapKey`, and
 * re-emits core events as Vue events.
 */
export const Map = defineComponent({
  name: 'TsMap',
  props: {
    center: { type: Array as unknown as PropType<[number, number]>, default: undefined },
    zoom: { type: Number, default: undefined },
    bearing: { type: Number, default: undefined },
    pitch: { type: Number, default: undefined },
    style: { type: [Object, String] as PropType<unknown>, default: undefined },
    containerStyle: { type: Object as PropType<Record<string, string | number>>, default: undefined },
    containerClass: { type: [String, Array, Object] as PropType<unknown>, default: undefined },
  },
  emits: [...FORWARDED_EVENTS, 'style-load', 'load-map'] as unknown as string[],
  setup(props, { slots, emit, expose }) {
    const mapRef: Ref<TsMapInstance | null> = shallowRef(null)
    const containerRef = shallowRef<HTMLDivElement | null>(null)
    provide(mapKey, mapRef)

    const bindings: { event: string, handler: (e: any) => void }[] = []

    onMounted(() => {
      if (!containerRef.value)
        return
      const options: Record<string, unknown> = {}
      if (props.center !== undefined)
        options.center = props.center
      if (props.zoom !== undefined)
        options.zoom = props.zoom
      if (props.bearing !== undefined)
        options.bearing = props.bearing
      if (props.pitch !== undefined)
        options.pitch = props.pitch
      if (props.style !== undefined)
        options.style = props.style

      const instance = new TsMap(containerRef.value, options)
      mapRef.value = instance
      emit('load-map', instance)

      for (const name of FORWARDED_EVENTS) {
        const handler = (e: any): void => {
          emit(name, e)
        }
        instance.on(name, handler)
        bindings.push({ event: name, handler })
      }
      const styleLoadHandler = (e: any): void => {
        emit('style-load', e)
      }
      instance.on('styleload', styleLoadHandler)
      bindings.push({ event: 'styleload', handler: styleLoadHandler })
    })

    watch(
      () => [props.center, props.zoom] as const,
      ([center, zoom]) => {
        const m = mapRef.value
        if (!m || !center || zoom === undefined)
          return
        m.setView(center, zoom)
      },
    )

    watch(
      () => props.bearing,
      (bearing) => {
        const m = mapRef.value as unknown as { setBearing?: (b: number) => void } | null
        if (!m || bearing === undefined)
          return
        m.setBearing?.(bearing)
      },
    )

    watch(
      () => props.pitch,
      (pitch) => {
        const m = mapRef.value as unknown as { setPitch?: (p: number) => void } | null
        if (!m || pitch === undefined)
          return
        m.setPitch?.(pitch)
      },
    )

    onBeforeUnmount(() => {
      const m = mapRef.value
      if (!m)
        return
      for (const b of bindings)
        m.off(b.event, b.handler)
      bindings.length = 0
      try {
        (m as unknown as { remove?: () => void }).remove?.()
      }
      catch {
        // ignore — host is being torn down
      }
      mapRef.value = null
    })

    expose({ map: mapRef })

    return () =>
      h(
        'div',
        {
          ref: containerRef,
          class: props.containerClass as unknown,
          style: props.containerStyle,
        },
        mapRef.value ? slots.default?.() : [],
      )
  },
})

export default Map
