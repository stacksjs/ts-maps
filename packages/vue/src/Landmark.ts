import type { LandmarkOptions, LatLngLike, ModelSource } from 'ts-maps'
import type { PropType } from 'vue'
import { Landmark as TsLandmark } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

/**
 * A glTF model standing where a building is, after Apple Maps' landmarks:
 * drawn with the buildings, hiding the labels behind it, and by default
 * leaving out the extruded building it stands on.
 *
 * ```vue
 * <MapInstance :center="[37.7952, -122.4028]" :zoom="17" :pitch="60">
 *   <TsLandmark model="/models/transamerica.glb" :position="[37.7952, -122.4028]" :rotation="45" />
 * </MapInstance>
 * ```
 *
 * `position`, `rotation`, `scale`, `altitude` and `opacity` are followed as
 * they change. `model`, `replace` and `min-zoom` are read when the landmark
 * is made: a new one makes it again. `ready` hands over the landmark, for
 * `ready()` and the setters.
 */
export const Landmark = defineComponent({
  name: 'TsLandmark',
  props: {
    /** A `.glb` or `.gltf` URL, a `.glb`'s bytes, or a parsed glTF. */
    model: { type: [String, Object, ArrayBuffer, Uint8Array] as PropType<ModelSource>, required: true },
    /** Where the model's origin stands. */
    position: { type: [Array, Object, Number] as PropType<LatLngLike>, required: true },
    /** Metres above the ground. Default 0. */
    altitude: { type: Number, default: undefined },
    /** Degrees clockwise. A glTF model faces south at 0. */
    rotation: { type: Number, default: undefined },
    /** Default 1: glTF is in metres. */
    scale: { type: Number, default: undefined },
    /** Leave out the extruded building under it. Default true. */
    replace: { type: Boolean, default: undefined },
    /** Hidden zoomed out further than this. Default 15. */
    minZoom: { type: Number, default: undefined },
    opacity: { type: Number, default: undefined },
  },
  emits: ['ready'],
  setup(props, { emit, expose }) {
    const mapRef = useMap()
    let landmark: TsLandmark | null = null

    const teardown = (): void => {
      landmark?.remove()
      landmark = null
    }

    const build = (): void => {
      const map = mapRef.value
      if (!map)
        return
      teardown()
      // Unset props are left out, so the landmark's defaults stand.
      const { model, position, altitude, rotation, scale, opacity, replace, minZoom } = props
      const options = Object.fromEntries(Object.entries({ model, position, altitude, rotation, scale, opacity, replace, minZoom }).filter(([, v]) => v !== undefined))
      const made = new TsLandmark(options as unknown as LandmarkOptions)
      landmark = made
      made.addTo(map)
      emit('ready', made)
    }

    const stop = watch(
      mapRef,
      (map) => {
        if (map && !landmark)
          build()
      },
      { immediate: true },
    )

    watch([() => props.model, () => props.replace, () => props.minZoom], () => build())
    watch(
      [() => props.position, () => props.rotation, () => props.scale, () => props.altitude, () => props.opacity],
      () => landmark?.sync({ position: props.position, rotation: props.rotation, scale: props.scale, altitude: props.altitude, opacity: props.opacity }),
    )

    expose({ get landmark() { return landmark } })

    onBeforeUnmount(() => {
      stop()
      teardown()
    })

    return () => null
  },
})
