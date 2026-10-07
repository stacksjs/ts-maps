import type { IMDFSource, IndoorVenue, SearchControl } from 'ts-maps'
import type { PropType } from 'vue'
import type { ControlPosition } from './controls'
import { INDOOR_EVENTS, IndoorMap as TsIndoorMap } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

/**
 * An indoor map, after Apple Maps: zoomed in on an airport or a mall, its
 * IMDF floor plan is drawn over the map one level at a time, with a level
 * picker beside it.
 *
 * ```vue
 * <TsMap :center="[37.6155, -122.3866]" :zoom="17">
 *   <TsSearch @ready="search = $event" />
 *   <TsIndoorMap venue="/imdf/sfo.zip" :search="search" v-model:level="level" />
 * </TsMap>
 * ```
 *
 * `level`, `position` and `search` are followed as they change; `level` works
 * with `v-model`, following the picker and a place chosen in `search`.
 * `venue`, `min-zoom`, `language` and `locale` are read when the control is
 * made: a new one makes it again. Events carry the core names — `load` (`{ venue }`),
 * `levelchange` (`{ level, name }`) and `visibilitychange` (`{ visible }`) —
 * and `ready` hands over the control, for `setLevel`, `search` and `levels`.
 */
export const IndoorMap = defineComponent({
  name: 'TsIndoorMap',
  props: {
    venue: { type: [String, Object, ArrayBuffer, Uint8Array] as PropType<IndoorVenue | IMDFSource>, required: true },
    level: { type: Number, default: undefined },
    position: { type: String as PropType<ControlPosition>, default: undefined },
    minZoom: { type: Number, default: undefined },
    language: { type: String, default: undefined },
    /** The language of the level picker. Default `language`, else the map's `locale`, else the browser's. */
    locale: { type: String, default: undefined },
    /** A `SearchControl` — from `<TsSearch @ready>` — to find the venue's places in. */
    search: { type: Object as PropType<SearchControl>, default: undefined },
  },
  emits: [...Object.keys(INDOOR_EVENTS), 'ready', 'update:level'],
  setup(props, { emit, expose }) {
    const mapRef = useMap()
    let indoor: TsIndoorMap | null = null
    let unlisten: (() => void) | null = null
    let disconnect: (() => void) | null = null

    const connect = (): void => {
      disconnect?.()
      disconnect = indoor && props.search ? indoor.connect(props.search) : null
    }

    const teardown = (): void => {
      disconnect?.()
      disconnect = null
      unlisten?.()
      unlisten = null
      indoor?.remove()
      indoor = null
    }

    const build = (): void => {
      const map = mapRef.value
      if (!map)
        return
      teardown()
      const made = new TsIndoorMap({ venue: props.venue, level: props.level, position: props.position, minZoom: props.minZoom, language: props.language, locale: props.locale })
      indoor = made
      made.addTo(map)
      unlisten = made.listen((type, e) => {
        emit(type, e)
        if (type === 'levelchange')
          emit('update:level', e.level)
      })
      emit('ready', made)
      connect()
      // A level asked for while the venue was loading is shown once it has,
      // and the level showing is reported for `v-model`.
      made.ready().then(() => {
        if (indoor !== made)
          return
        made.sync({ level: props.level })
        if (made.level !== props.level)
          emit('update:level', made.level)
      }, () => {})
    }

    const stop = watch(
      mapRef,
      (map) => {
        if (map && !indoor)
          build()
      },
      { immediate: true },
    )

    watch([() => props.venue, () => props.minZoom, () => props.language, () => props.locale], () => build())
    watch([() => props.level, () => props.position], () => indoor?.sync({ level: props.level, position: props.position }))
    watch(() => props.search, () => connect())

    expose({ get control() { return indoor } })

    onBeforeUnmount(() => {
      stop()
      teardown()
    })

    return () => null
  },
})
