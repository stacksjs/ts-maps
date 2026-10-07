import type { LatLngInput, TurnByTurnOptions, TurnByTurnTarget } from 'ts-maps'
import type { PropType } from 'vue'
import { TURN_BY_TURN_EVENTS, TurnByTurn as TsTurnByTurn } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

/**
 * Turn-by-turn navigation, after Apple Maps.
 *
 * ```vue
 * <TsMap :center="[37.79, -122.39]" :zoom="13">
 *   <TsTurnByTurn :from="[37.7955, -122.3937]" :to="[37.8029, -122.4484]" :active="driving" @arrive="done" />
 * </TsMap>
 * ```
 *
 * Setting `from` and `to` previews the routes; `active` starts guidance.
 * Every prop is followed as it changes. Events carry the core names —
 * `preview`, `routeselect`, `start`, `progress`, `instruction`, `reroute`,
 * `arrive`, `end`, `error` — and `ready` hands over the underlying
 * `TurnByTurn`.
 */
export const TurnByTurn = defineComponent({
  name: 'TsTurnByTurn',
  props: {
    from: { type: [Array, Object] as PropType<LatLngInput | null>, default: undefined },
    to: { type: [Array, Object] as PropType<LatLngInput | null>, default: undefined },
    active: { type: Boolean, default: false },
    profile: { type: String as PropType<TurnByTurnOptions['profile']>, default: undefined },
    units: { type: String as PropType<TurnByTurnOptions['units']>, default: undefined },
    // `undefined` rather than Vue's `false` for an absent boolean, so the
    // core's defaults — voice on, alternatives offered — apply.
    voice: { type: Boolean, default: undefined },
    simulate: { type: [Boolean, Object] as PropType<TurnByTurnOptions['simulate']>, default: undefined },
    alternatives: { type: Boolean, default: undefined },
    destinationName: { type: String, default: undefined },
    directions: { type: Object as PropType<TurnByTurnOptions['directions']>, default: undefined },
    /** The language of its cards and voice. Default the map's `locale`, else the browser's. */
    locale: { type: String, default: undefined },
  },
  emits: [...Object.keys(TURN_BY_TURN_EVENTS), 'ready'],
  setup(props, { emit, expose }) {
    const mapRef = useMap()
    let nav: TsTurnByTurn | null = null
    const options = (): TurnByTurnOptions => ({
      profile: props.profile,
      units: props.units,
      voice: props.voice,
      simulate: props.simulate,
      alternatives: props.alternatives,
      destinationName: props.destinationName,
      directions: props.directions,
      locale: props.locale,
    })
    const target = (): TurnByTurnTarget => ({ from: props.from, to: props.to, active: props.active, ...options() })

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || nav)
          return
        nav = new TsTurnByTurn(map, options())
        for (const event of Object.keys(TURN_BY_TURN_EVENTS))
          nav.on(event, (e: any) => emit(event, e))
        emit('ready', nav)
        nav.sync(target())
      },
      { immediate: true },
    )

    // Every option is followed: another `profile` or `directions` fetches a
    // showing preview again, `units` redraw the cards in place. Places and
    // `simulate` are compared by value, so inline literals are not a change.
    watch(
      [
        () => JSON.stringify(props.from ?? null),
        () => JSON.stringify(props.to ?? null),
        () => props.active,
        () => props.profile,
        () => props.units,
        () => props.voice,
        () => JSON.stringify(props.simulate ?? null),
        () => props.alternatives,
        () => props.destinationName,
        () => props.directions,
        () => props.locale,
      ],
      () => nav?.sync(target()),
    )

    expose({ get nav() { return nav } })

    onBeforeUnmount(() => {
      stop()
      nav?.stop()
      nav = null
    })

    return () => null
  },
})
