import type { TerritoryStore, TerritoryStyle } from 'ts-maps'
import type { PropType } from 'vue'
import { RunTrailLayer as TsRunTrailLayer, TerritoryLayer as TsTerritoryLayer } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

/**
 * Territories on the map.
 *
 * ```vue
 * <TsMap :center="[34.02, -118.47]" :zoom="16">
 *   <TsTerritoryLayer :store="store" self="me" />
 * </TsMap>
 * ```
 */
export const TerritoryLayer = defineComponent({
  name: 'TsTerritoryLayer',
  props: {
    store: { type: Object as PropType<TerritoryStore>, default: undefined },
    styles: { type: Object as PropType<Record<string, TerritoryStyle>>, default: undefined },
    self: { type: String, default: undefined },
    captureDuration: { type: Number, default: undefined },
    labelMinZoom: { type: Number, default: undefined },
    units: { type: String as PropType<'metric' | 'imperial'>, default: undefined },
    options: { type: Object as PropType<Record<string, unknown>>, default: undefined },
  },
  setup(props) {
    const mapRef = useMap()
    let layer: InstanceType<typeof TsTerritoryLayer> | null = null

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || layer)
          return
        layer = new TsTerritoryLayer({
          ...props.options,
          ...(props.store ? { store: props.store } : {}),
          ...(props.styles ? { styles: props.styles } : {}),
          ...(props.self === undefined ? {} : { self: props.self }),
          ...(props.captureDuration === undefined ? {} : { captureDuration: props.captureDuration }),
          ...(props.labelMinZoom === undefined ? {} : { labelMinZoom: props.labelMinZoom }),
          ...(props.units === undefined ? {} : { units: props.units }),
        });
        (map as unknown as { addLayer: (l: any) => void }).addLayer(layer)
      },
      { immediate: true },
    )

    // Watched separately, and not deeply: a store holds live geometry and a
    // deep watcher would walk every ring of every territory on each change.
    watch(
      () => props.store,
      (store) => {
        if (layer && store)
          layer.setStore(store)
      },
    )

    watch(
      () => props.styles,
      (styles) => {
        if (!layer || !styles)
          return
        for (const [owner, style] of Object.entries(styles))
          layer.setOwnerStyle(owner, style)
      },
      { deep: true },
    )

    onBeforeUnmount(() => {
      stop()
      const map = mapRef.value
      if (layer && map)
        (map as unknown as { removeLayer: (l: any) => void }).removeLayer(layer)
      layer = null
    })

    return () => null
  },
})

/** The live trail behind a runner. */
export const RunTrailLayer = defineComponent({
  name: 'TsRunTrailLayer',
  props: {
    track: { type: Array as PropType<number[][]>, default: undefined },
    color: { type: String, default: undefined },
    weight: { type: Number, default: undefined },
    showPotential: { type: Boolean, default: undefined },
    options: { type: Object as PropType<Record<string, unknown>>, default: undefined },
  },
  setup(props) {
    const mapRef = useMap()
    let layer: InstanceType<typeof TsRunTrailLayer> | null = null

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || layer)
          return
        layer = new TsRunTrailLayer({
          ...props.options,
          ...(props.color === undefined ? {} : { color: props.color }),
          ...(props.weight === undefined ? {} : { weight: props.weight }),
          ...(props.showPotential === undefined ? {} : { showPotential: props.showPotential }),
        });
        (map as unknown as { addLayer: (l: any) => void }).addLayer(layer)
      },
      { immediate: true },
    )

    watch(
      () => props.track,
      (track) => {
        if (layer && track)
          layer.setTrack(track)
      },
    )

    onBeforeUnmount(() => {
      stop()
      const map = mapRef.value
      if (layer && map)
        (map as unknown as { removeLayer: (l: any) => void }).removeLayer(layer)
      layer = null
    })

    return () => null
  },
})

export default TerritoryLayer
