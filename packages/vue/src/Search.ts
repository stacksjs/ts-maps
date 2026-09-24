import type { SearchControlOptions } from 'ts-maps'
import type { PropType } from 'vue'
import type { ControlPosition } from './controls'
import { SEARCH_EVENTS, SearchControl } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

/**
 * Search, after Apple Maps: "Search Maps" with Find Nearby and Recents,
 * suggestions as you type, pins for results, and a card with Directions.
 *
 * ```vue
 * <TsMap :center="[37.79, -122.41]" :zoom="15">
 *   <TsTurnByTurn @ready="nav = $event" />
 *   <TsSearch :turn-by-turn="nav" @select="({ place }) => chosen = place" />
 * </TsMap>
 * ```
 *
 * Options are read when the map arrives; `query` and `turnByTurn` are
 * followed as they change. Events carry the core names — `results`,
 * `select`, `directions`, `clear` — and `ready` hands over the control.
 */
export const Search = defineComponent({
  name: 'TsSearch',
  props: {
    query: { type: String, default: undefined },
    position: { type: String as PropType<ControlPosition>, default: undefined },
    placeholder: { type: String, default: undefined },
    // `null` means "none", so these default to undefined — the core's own
    // defaults — rather than Vue's null.
    provider: { type: Object as PropType<SearchControlOptions['provider']>, default: undefined },
    offline: { type: Object as PropType<SearchControlOptions['offline']>, default: undefined },
    categories: { type: Array as PropType<SearchControlOptions['categories']>, default: undefined },
    recents: { type: Boolean, default: undefined },
    units: { type: String as PropType<SearchControlOptions['units']>, default: undefined },
    location: { type: Function as PropType<SearchControlOptions['location']>, default: undefined },
    turnByTurn: { type: Object as PropType<SearchControlOptions['turnByTurn']>, default: undefined },
    origin: { type: Function as PropType<SearchControlOptions['origin']>, default: undefined },
    language: { type: String, default: undefined },
  },
  emits: [...Object.keys(SEARCH_EVENTS), 'ready'],
  setup(props, { emit, expose }) {
    const mapRef = useMap()
    let search: SearchControl | null = null
    let unlisten: (() => void) | null = null

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || search)
          return
        search = new SearchControl({
          position: props.position,
          placeholder: props.placeholder,
          provider: props.provider,
          offline: props.offline,
          categories: props.categories,
          recents: props.recents,
          units: props.units,
          location: props.location,
          turnByTurn: props.turnByTurn,
          origin: props.origin,
          language: props.language,
        })
        search.addTo(map)
        unlisten = search.listen((type, e) => emit(type, e))
        emit('ready', search)
        search.sync({ query: props.query })
      },
      { immediate: true },
    )

    watch(() => props.query, query => search?.sync({ query }))
    watch(() => props.turnByTurn, (nav) => {
      if (search)
        search.options.turnByTurn = nav
    })

    expose({ get control() { return search } })

    onBeforeUnmount(() => {
      stop()
      unlisten?.()
      search?.remove()
      search = null
    })

    return () => null
  },
})
