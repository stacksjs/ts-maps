import type { MapTypeControlOptions, MapTypeOption, MapTypeTarget } from 'ts-maps'
import type { PropType } from 'vue'
import type { ControlPosition } from './controls'
import { MAP_TYPE_EVENTS, MapTypeControl } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

/**
 * The map type picker, after Apple Maps: a card of map types, Explore,
 * Driving and Satellite, that sets the map's style and keeps the layers the
 * page added to it.
 *
 * ```vue
 * <MapInstance :center="[37.78, -122.42]" :zoom="13">
 *   <TsMapType :types="mapTypes({ tiles, imagery })" v-model:value="type" v-model:open="picking" />
 * </MapInstance>
 * ```
 *
 * Every prop is followed as it changes: a new `value` shows that type, a new
 * `types` redraws the card, a new `position` moves the button. Given a
 * `traffic` layer, the card has a Traffic switch, and `showTraffic` turns it.
 * `value`, `open` and `showTraffic` work with `v-model`. Events carry the
 * core names — `change` (`{ value }`), `openchange` (`{ open }`) and
 * `trafficchange` (`{ traffic }`) — and `ready` hands over the control, for
 * `select`.
 */
export const MapType = defineComponent({
  name: 'TsMapType',
  props: {
    types: { type: Array as PropType<MapTypeOption[]>, required: true },
    value: { type: String, default: undefined },
    // `undefined` rather than Vue's `false` for an absent boolean, so a
    // component that is not told leaves the card alone.
    open: { type: Boolean, default: undefined },
    position: { type: String as PropType<ControlPosition>, default: undefined },
    title: { type: String, default: undefined },
    /** A `TrafficLayer`, for a Traffic switch on the card. Read at mount. */
    traffic: { type: Object as PropType<MapTypeControlOptions['traffic']>, default: undefined },
    showTraffic: { type: Boolean, default: undefined },
    /** The language of its words. Default the map's `locale`, else the browser's. */
    locale: { type: String, default: undefined },
  },
  emits: [...Object.keys(MAP_TYPE_EVENTS), 'ready', 'update:value', 'update:open', 'update:showTraffic'],
  setup(props, { emit, expose }) {
    const mapRef = useMap()
    let picker: MapTypeControl | null = null
    let unlisten: (() => void) | null = null
    const target = (): MapTypeTarget => ({
      types: props.types,
      value: props.value,
      open: props.open,
      position: props.position,
      showTraffic: props.showTraffic,
      locale: props.locale,
    })

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || picker)
          return
        picker = new MapTypeControl({ types: props.types, value: props.value, position: props.position, title: props.title, traffic: props.traffic, locale: props.locale })
        picker.addTo(map)
        unlisten = picker.listen((type, e) => {
          emit(type, e)
          if (type === 'change')
            emit('update:value', e.value)
          else if (type === 'openchange')
            emit('update:open', e.open)
          else if (type === 'trafficchange')
            emit('update:showTraffic', e.traffic)
        })
        emit('ready', picker)
        picker.sync(target())
      },
      { immediate: true },
    )

    // The control follows `value`, `open` and `showTraffic` only when they
    // change, so the card closed by its own ✕ stays closed when another prop
    // changes.
    watch(
      [() => props.types, () => props.value, () => props.open, () => props.position, () => props.showTraffic, () => props.locale],
      () => picker?.sync(target()),
    )

    expose({ get control() { return picker } })

    onBeforeUnmount(() => {
      stop()
      unlisten?.()
      picker?.remove()
      picker = null
    })

    return () => null
  },
})
