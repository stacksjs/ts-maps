import type { SearchControlOptions, SearchTarget } from 'ts-maps'
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
 * <MapInstance :center="[37.79, -122.41]" :zoom="15">
 *   <TsTurnByTurn @ready="nav = $event" />
 *   <TsSearch :turn-by-turn="nav" @select="({ place }) => chosen = place" />
 * </MapInstance>
 * ```
 *
 * Every prop is followed as it changes: a new `provider` is asked from the
 * next query on, new `categories` redraw Find Nearby in place. Events carry the core names — `results`,
 * `select`, `details`, `directions`, `save`, `unsave`, `clear` — and `ready`
 * hands over the control. `saved` is where Save keeps Favorites (default the
 * page's `savedPlaces()`, `null` for none); `show-saved` puts them on the map
 * as stars.
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
    /** A `LookAround` — from `<TsLookAround @ready>` — for the place card's picture of the street. */
    lookAround: { type: Object as PropType<SearchControlOptions['lookAround']>, default: undefined },
    language: { type: String, default: undefined },
    /** The language its words are in. Default `language`, else the map's `locale`, else the browser's. */
    locale: { type: String, default: undefined },
    details: { type: Object as PropType<SearchControlOptions['details']>, default: undefined },
    shareUrl: { type: Function as PropType<SearchControlOptions['shareUrl']>, default: undefined },
    saved: { type: Object as PropType<SearchControlOptions['saved']>, default: undefined },
    showSaved: { type: Boolean, default: undefined },
  },
  emits: [...Object.keys(SEARCH_EVENTS), 'ready'],
  setup(props, { emit, expose }) {
    const mapRef = useMap()
    let search: SearchControl | null = null
    let unlisten: (() => void) | null = null
    const target = (): SearchTarget => ({
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
      lookAround: props.lookAround,
      language: props.language,
      locale: props.locale,
      details: props.details,
      shareUrl: props.shareUrl,
      saved: props.saved,
      showSaved: props.showSaved,
    })

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || search)
          return
        search = new SearchControl(target())
        search.addTo(map)
        unlisten = search.listen((type, e) => emit(type, e))
        emit('ready', search)
        search.sync({ query: props.query })
      },
      { immediate: true },
    )

    // Every option is followed; the control does nothing for one that has not
    // changed. A `TurnByTurn` usually arrives after mount, from its own
    // `ready`, and a `LookAround` the same way. Categories are compared by
    // value, so an inline list is not a change on every render.
    watch(
      [
        () => props.position,
        () => props.placeholder,
        () => props.provider,
        () => props.offline,
        () => JSON.stringify(props.categories?.map(c => [c.id, c.label, c.icon]) ?? null),
        () => props.recents,
        () => props.units,
        () => props.location,
        () => props.turnByTurn,
        () => props.origin,
        () => props.lookAround,
        () => props.language,
        () => props.locale,
        () => props.details,
        () => props.shareUrl,
        () => props.saved,
        () => props.showSaved,
      ],
      () => search?.sync(target()),
    )
    watch(() => props.query, query => search?.sync({ query }))

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
