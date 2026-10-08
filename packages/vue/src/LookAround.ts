import type { LatLngLike, LookAroundTarget, StreetImageryProvider } from 'ts-maps'
import type { PropType } from 'vue'
import type { ControlPosition } from './controls'
import { LOOK_AROUND_EVENTS, LookAround as TsLookAround } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

/**
 * Look Around, after Apple Maps: a binoculars button that shows the streets
 * with pictures, and a full-bleed viewer to turn in and walk through them.
 *
 * ```vue
 * <MapInstance :center="[48.8606, 2.3376]" :zoom="16">
 *   <TsLookAround v-model:choosing="choosing" :at="at" @ready="look = $event" />
 *   <TsSearch :look-around="look" />
 * </MapInstance>
 * ```
 *
 * `provider`, `position`, `choosing`, `at` and `heading` are followed as they
 * change; `choosing`, `at` and `heading` only when they change, so the viewer
 * closed by its own Done stays closed. `choosing` works with `v-model`.
 * `mini-map`, `locale` and `title` are read when the control is made: a new
 * one makes it again. Events carry the core names — `open` and `imagechange`
 * (`{ image }`), `close`, `viewchange` (`{ heading, pitch, fov }`),
 * `choosingchange` (`{ choosing }`) and `notfound` (`{ at }`) — and `ready`
 * hands over the control, for `open`, `close`, `setView` and `step`.
 */
export const LookAround = defineComponent({
  name: 'TsLookAround',
  props: {
    /** Where pictures come from. Default Panoramax. */
    provider: { type: Object as PropType<StreetImageryProvider>, default: undefined },
    position: { type: String as PropType<ControlPosition>, default: undefined },
    // `undefined` rather than Vue's `false` for an absent boolean, so the
    // core's own defaults apply.
    miniMap: { type: Boolean, default: undefined },
    /** The language of its words. Default the map's `locale`, else the browser's. */
    locale: { type: String, default: undefined },
    title: { type: String, default: undefined },
    choosing: { type: Boolean, default: undefined },
    /** Look from the picture nearest here; `null` to close. */
    at: { type: [Array, Object] as PropType<LatLngLike | null>, default: undefined },
    heading: { type: Number, default: undefined },
  },
  emits: [...Object.keys(LOOK_AROUND_EVENTS), 'ready', 'update:choosing'],
  setup(props, { emit, expose }) {
    const mapRef = useMap()
    let look: TsLookAround | null = null
    let unlisten: (() => void) | null = null
    const target = (): LookAroundTarget => ({
      provider: props.provider,
      position: props.position,
      choosing: props.choosing,
      at: props.at,
      heading: props.heading,
    })

    const teardown = (): void => {
      unlisten?.()
      unlisten = null
      look?.remove()
      look = null
    }

    const build = (): void => {
      const map = mapRef.value
      if (!map)
        return
      teardown()
      const made = new TsLookAround({ provider: props.provider, position: props.position, miniMap: props.miniMap, locale: props.locale, title: props.title })
      look = made
      made.addTo(map)
      unlisten = made.listen((type, e) => {
        emit(type, e)
        if (type === 'choosingchange')
          emit('update:choosing', e.choosing)
      })
      emit('ready', made)
      made.sync(target())
    }

    const stop = watch(
      mapRef,
      (map) => {
        if (map && !look)
          build()
      },
      { immediate: true },
    )

    watch([() => props.miniMap, () => props.locale, () => props.title], () => build())
    // `at` is compared by value, so an inline position is not a change on
    // every render.
    watch(
      [() => props.provider, () => props.position, () => props.choosing, () => JSON.stringify(props.at), () => props.heading],
      () => look?.sync(target()),
    )

    expose({ get control() { return look } })

    onBeforeUnmount(() => {
      stop()
      teardown()
    })

    return () => null
  },
})
