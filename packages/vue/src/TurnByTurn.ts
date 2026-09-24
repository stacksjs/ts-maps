import type { LatLngInput, TurnByTurnOptions } from 'ts-maps'
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
 * Options are read when the map arrives; `from`, `to` and `active` are
 * followed as they change. Events carry the core names — `preview`,
 * `routeselect`, `start`, `progress`, `instruction`, `reroute`, `arrive`,
 * `end`, `error` — and `ready` hands over the underlying `TurnByTurn`.
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
  },
  emits: [...Object.keys(TURN_BY_TURN_EVENTS), 'ready'],
  setup(props, { emit, expose }) {
    const mapRef = useMap()
    let nav: TsTurnByTurn | null = null

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || nav)
          return
        nav = new TsTurnByTurn(map, {
          profile: props.profile,
          units: props.units,
          voice: props.voice,
          simulate: props.simulate,
          alternatives: props.alternatives,
          destinationName: props.destinationName,
          directions: props.directions,
        })
        for (const event of Object.keys(TURN_BY_TURN_EVENTS))
          nav.on(event, (e: any) => emit(event, e))
        emit('ready', nav)
        nav.sync({ from: props.from, to: props.to, active: props.active })
      },
      { immediate: true },
    )

    watch(
      () => [JSON.stringify(props.from ?? null), JSON.stringify(props.to ?? null), props.active],
      () => nav?.sync({ from: props.from, to: props.to, active: props.active }),
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
