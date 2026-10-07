import type { TreesOptions } from 'ts-maps'
import type { PropType } from 'vue'
import { Trees as TsTrees } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

/**
 * Trees, standing in the woods and parks the basemap already has, after
 * Apple Maps: low-poly trees that come in as the map tilts. One per map.
 *
 * ```vue
 * <TsMap :center="[37.7694, -122.4862]" :zoom="16" :pitch="60">
 *   <TsTrees :spacing="12" />
 * </TsMap>
 * ```
 *
 * Every prop is followed as it changes. `ready` hands over the trees, for
 * `setOptions`.
 */
export const Trees = defineComponent({
  name: 'TsTrees',
  props: {
    /** Metres between trees in a wood. Default 9. */
    spacing: { type: Number, default: undefined },
    /** Most trees a tile plants. Default 3000. */
    maxPerTile: { type: Number, default: undefined },
    /** Default 15. */
    minZoom: { type: Number, default: undefined },
    /** Degrees of tilt before trees appear. Default 20. */
    minPitch: { type: Number, default: undefined },
    /** Crown colours, picked between per tree. */
    colors: { type: Array as PropType<string[]>, default: undefined },
    /** Metres. Default [7, 14]. */
    height: { type: Array as unknown as PropType<[number, number]>, default: undefined },
    /** Which features are woods to plant and which are single trees. */
    match: { type: Function as PropType<TreesOptions['match']>, default: undefined },
  },
  emits: ['ready'],
  setup(props, { emit, expose }) {
    const mapRef = useMap()
    let trees: TsTrees | null = null

    const options = (): TreesOptions => ({
      spacing: props.spacing,
      maxPerTile: props.maxPerTile,
      minZoom: props.minZoom,
      minPitch: props.minPitch,
      colors: props.colors,
      height: props.height,
      match: props.match,
    })

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || trees)
          return
        trees = new TsTrees(options())
        trees.addTo(map)
        emit('ready', trees)
      },
      { immediate: true },
    )

    // Arrays are compared by content, so a new `colors` with the same
    // colours does not plant the trees again.
    watch(
      () => [JSON.stringify([props.spacing, props.maxPerTile, props.minZoom, props.minPitch, props.colors, props.height]), props.match],
      ([key, match], [was, wasMatch]) => {
        if (key !== was || match !== wasMatch)
          trees?.setOptions(options())
      },
    )

    expose({ get trees() { return trees } })

    onBeforeUnmount(() => {
      stop()
      trees?.remove()
      trees = null
    })

    return () => null
  },
})
