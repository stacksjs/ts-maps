import type { OfflineMapsControlOptions, OfflineMaps as TsOfflineMapsManager } from 'ts-maps'
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
 * <TsMap :center="[37.78, -122.42]" :zoom="13">
 *   <TsOfflineMaps v-model:open="showOffline" @complete="({ region }) => toast(region.name)" />
 * </TsMap>
 * ```
 *
 * Options are read when the map arrives; `open` and `onlyOffline` are
 * followed as they change, and both work with `v-model`. Events carry the
 * core names — `change`, `progress`, `complete`, `error`, `delete`,
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
  },
  emits: [...Object.keys(OFFLINE_MAPS_EVENTS), 'ready', 'update:open', 'update:onlyOffline'],
  setup(props, { emit, expose }) {
    const mapRef = useMap()
    let offline: OfflineMapsControl | null = null
    let unlisten: (() => void) | null = null

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
        offline.sync({ open: props.open, onlyOffline: props.onlyOffline })
      },
      { immediate: true },
    )

    watch(
      () => [props.open, props.onlyOffline],
      () => offline?.sync({ open: props.open, onlyOffline: props.onlyOffline }),
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
