<script lang="ts">
  /**
   * A glTF model standing where a building is, after Apple Maps' landmarks:
   * drawn with the buildings, hiding the labels behind it, and by default
   * leaving out the extruded building it stands on.
   *
   * ```svelte
   * <Map center={[37.7952, -122.4028]} zoom={17} pitch={60}>
   *   <Landmark model="/models/transamerica.glb" position={[37.7952, -122.4028]} rotation={45} />
   * </Map>
   * ```
   *
   * `position`, `rotation`, `scale`, `altitude` and `opacity` are followed as
   * they change. `model`, `replace` and `minZoom` are read when the landmark
   * is made: a new one makes it again.
   */
  import type { LandmarkOptions, LatLngLike, ModelSource, TsMap } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { Landmark } from 'ts-maps'
  import { useMap } from './useMap'

  /** A `.glb` or `.gltf` URL, a `.glb`'s bytes, or a parsed glTF. */
  export let model: ModelSource
  /** Where the model's origin stands. */
  export let position: LatLngLike
  export let altitude: number | undefined = undefined
  /** Degrees clockwise. A glTF model faces south at 0. */
  export let rotation: number | undefined = undefined
  export let scale: number | undefined = undefined
  /** Leave out the extruded building under it. Default true. */
  export let replace: boolean | undefined = undefined
  /** Hidden zoomed out further than this. Default 15. */
  export let minZoom: number | undefined = undefined
  export let opacity: number | undefined = undefined

  /* eslint-disable no-unused-vars */
  export let onReady: ((landmark: Landmark) => void) | undefined = undefined
  /* eslint-enable no-unused-vars */

  let map: TsMap | null = null
  let landmark: Landmark | null = null

  function teardown(): void {
    landmark?.remove()
    landmark = null
  }

  function build(from: ModelSource, keep: boolean | undefined, zoom: number | undefined): void {
    teardown()
    if (!map) return
    // Unset props are left out, so the landmark's defaults stand.
    const options = Object.fromEntries(Object.entries({ model: from, position, altitude, rotation, scale, opacity, replace: keep, minZoom: zoom }).filter(([, v]) => v !== undefined))
    const made = new Landmark(options as unknown as LandmarkOptions)
    made.addTo(map)
    landmark = made
    onReady?.(made)
  }

  // Read during initialisation: `getContext` is not available in onMount
  // under Svelte 4, nor in onDestroy under Svelte 5.
  const contextMap = useMap()

  onMount(() => {
    map = contextMap
  })

  $: if (map) build(model, replace, minZoom)
  $: if (landmark) landmark.sync({ position, rotation, scale, altitude, opacity })

  onDestroy(() => {
    teardown()
  })
</script>
