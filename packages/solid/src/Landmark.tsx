import type { JSX } from 'solid-js'
import type { LandmarkOptions, LatLngLike, ModelSource } from 'ts-maps'
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js'
import { Landmark as TsLandmark } from 'ts-maps'
import { useMap } from './context'

/* eslint-disable no-unused-vars */
export interface LandmarkProps {
  /** A `.glb` or `.gltf` URL, a `.glb`'s bytes, or a parsed glTF. */
  model: ModelSource
  /** Where the model's origin stands. */
  position: LatLngLike
  /** Metres above the ground. Default 0. */
  altitude?: number
  /** Degrees clockwise. A glTF model faces south at 0. */
  rotation?: number
  /** Default 1: glTF is in metres. */
  scale?: number
  /** Leave out the extruded building under it. Default true. */
  replace?: boolean
  /** Hidden zoomed out further than this. Default 15. */
  minZoom?: number
  opacity?: number
  /** The underlying landmark, for `ready` and the setters. */
  onReady?: (landmark: TsLandmark) => void
}
/* eslint-enable no-unused-vars */

/**
 * A glTF model standing where a building is, after Apple Maps' landmarks:
 * drawn with the buildings, hiding the labels behind it, and by default
 * leaving out the extruded building it stands on.
 *
 * ```tsx
 * <Map center={[37.7952, -122.4028]} zoom={17} pitch={60}>
 *   <Landmark model="/models/transamerica.glb" position={[37.7952, -122.4028]} rotation={rotation()} />
 * </Map>
 * ```
 *
 * `position`, `rotation`, `scale`, `altitude` and `opacity` are followed as
 * they change. `model`, `replace` and `minZoom` are read when the landmark is
 * made: a new one makes it again.
 */
export function Landmark(props: LandmarkProps): JSX.Element {
  const [landmark, setLandmark] = createSignal<TsLandmark | null>(null)

  // An effect rather than onMount: the map arrives through a signal. It runs
  // again for a new model, `replace` or `minZoom`, making the landmark again;
  // the other options are read untracked here, and followed below.
  createEffect(() => {
    const map = useMap()
    const { model, replace, minZoom } = props
    if (!map)
      return
    const made = untrack(() => {
      // Unset props are left out, so the landmark's defaults stand.
      const { position, altitude, rotation, scale, opacity } = props
      const options = Object.fromEntries(Object.entries({ model, position, altitude, rotation, scale, opacity, replace, minZoom }).filter(([, v]) => v !== undefined))
      return new TsLandmark(options as unknown as LandmarkOptions)
    })
    made.addTo(map)
    untrack(() => props.onReady?.(made))
    setLandmark(made)
    onCleanup(() => {
      made.remove()
      setLandmark(null)
    })
  })

  createEffect(() => {
    const target = { position: props.position, rotation: props.rotation, scale: props.scale, altitude: props.altitude, opacity: props.opacity }
    landmark()?.sync(target)
  })

  return null as unknown as JSX.Element
}
