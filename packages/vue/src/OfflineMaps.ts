import type { OfflineMapsControlOptions, OfflineMapsTarget, OfflineMaps as TsOfflineMapsManager } from 'ts-maps'
import type { PropType } from 'vue'
import type { ControlPosition } from './controls'
import { OFFLINE_MAPS_EVENTS, OfflineMapsControl } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

/**
 * Offline maps, after Apple Maps: a button opening the list of downloaded
 * maps, an area picker with an estimated size, and a pill when the
 * connection drops.
 *
 * ```vue
 * <MapInstance :center="[37.78, -122.42]" :zoom="13">
 *   <TsOfflineMaps v-model:open="showOffline" @complete="({ region }) => toast(region.name)" />
 * </MapInstance>
 * ```
 *
 * Every prop is followed as it changes: a new `maps` moves the panel and its
 * events onto that manager, a new `position` moves the button. `open` and
 * `onlyOffline` work with `v-model`. Events carry the core names — `change`, `progress`, `complete`, `error`, `delete`,
 * `modechange`, `openchange` — and `ready` hands over the underlying
 * control, whose `maps` is the manager.
 */
export const OfflineMaps = defineComponent({
  name: 'TsOfflineMaps',
  props: {
    // `undefined` rather than Vue's `false` for an absent boolean, so a
    // component that is not told leaves the panel and the mode alone.
    open: { type: Boolean, default: undefined },
    onlyOffline: { type: Boolean, default: undefined },
    position: { type: String as PropType<ControlPosition>, default: undefined },
    maps: { type: Object as PropType<TsOfflineMapsManager>, default: undefined },
    geocoder: { type: Object as PropType<OfflineMapsControlOptions['geocoder']>, default: undefined },
    resources: { type: Array as PropType<string[]>, default: undefined },
    showStatus: { type: Boolean, default: undefined },
    title: { type: String, default: undefined },
    /** The language its words are in. Default the map's `locale`, else the browser's. */
    locale: { type: String, default: undefined },
  },
  emits: [...Object.keys(OFFLINE_MAPS_EVENTS), 'ready', 'update:open', 'update:onlyOffline'],
  setup(props, { emit, expose }) {
    const mapRef = useMap()
    let offline: OfflineMapsControl | null = null
    let unlisten: (() => void) | null = null
    const target = (): OfflineMapsTarget => ({
      open: props.open,
      onlyOffline: props.onlyOffline,
      position: props.position,
      maps: props.maps,
      geocoder: props.geocoder,
      resources: props.resources,
      showStatus: props.showStatus,
      title: props.title,
      locale: props.locale,
    })

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || offline)
          return
        offline = new OfflineMapsControl({
          position: props.position,
          maps: props.maps,
          geocoder: props.geocoder,
          resources: props.resources,
          showStatus: props.showStatus,
          title: props.title,
          locale: props.locale,
        })
        offline.addTo(map)
        unlisten = offline.listen((type, e) => {
          emit(type, e)
          if (type === 'openchange')
            emit('update:open', e.open)
          else if (type === 'modechange')
            emit('update:onlyOffline', e.onlyOffline)
        })
        emit('ready', offline)
        offline.sync(target())
      },
      { immediate: true },
    )

    // Every option is followed; the control does nothing for one that has not
    // changed. `resources` is compared by value, so an inline array is not a
    // change on every render.
    watch(
      [
        () => props.open,
        () => props.onlyOffline,
        () => props.position,
        () => props.maps,
        () => props.geocoder,
        () => JSON.stringify(props.resources ?? null),
        () => props.showStatus,
        () => props.title,
        () => props.locale,
      ],
      () => offline?.sync(target()),
    )

    expose({ get control() { return offline } })

    onBeforeUnmount(() => {
      stop()
      unlisten?.()
      offline?.remove()
      offline = null
    })

    return () => null
  },
})
