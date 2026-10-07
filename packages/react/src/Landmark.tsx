import type { LandmarkOptions, LatLngLike, ModelSource } from 'ts-maps'
import { useEffect, useRef } from 'react'
import { Landmark as TsLandmark } from 'ts-maps'
import { useMap } from './useMap'

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
  // eslint-disable-next-line no-unused-vars
  onReady?: (landmark: TsLandmark) => void
}

/**
 * A glTF model standing where a building is, after Apple Maps' landmarks:
 * drawn with the buildings, hiding the labels behind it, and by default
 * leaving out the extruded building it stands on.
 *
 * ```tsx
 * <Map center={[37.7952, -122.4028]} zoom={17} pitch={60}>
 *   <Landmark model="/models/transamerica.glb" position={[37.7952, -122.4028]} rotation={45} />
 * </Map>
 * ```
 *
 * `position`, `rotation`, `scale`, `altitude` and `opacity` are followed as
 * they change. `model`, `replace` and `minZoom` are read when the landmark is
 * made: a new one makes it again, so keep a model's identity stable across
 * renders.
 */
export function Landmark(props: LandmarkProps): null {
  const map = useMap()
  const landmarkRef = useRef<TsLandmark | null>(null)
  const latest = useRef(props)
  latest.current = props

  const { model, replace, minZoom } = props
  useEffect(() => {
    const { position, altitude, rotation, scale, opacity } = latest.current
    // Unset props are left out, so the landmark's defaults stand.
    const options = Object.fromEntries(Object.entries({ model, position, altitude, rotation, scale, opacity, replace, minZoom }).filter(([, v]) => v !== undefined))
    const landmark = new TsLandmark(options as unknown as LandmarkOptions)
    landmark.addTo(map)
    landmarkRef.current = landmark
    latest.current.onReady?.(landmark)
    return () => {
      landmark.remove()
      landmarkRef.current = null
    }
  }, [map, model, replace, minZoom])

  const { position, rotation, scale, altitude, opacity } = props
  useEffect(() => {
    landmarkRef.current?.sync({ position, rotation, scale, altitude, opacity })
  }, [map, model, replace, minZoom, position, rotation, scale, altitude, opacity])

  return null
}
