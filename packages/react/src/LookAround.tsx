import type { LatLngLike, StreetImageryProvider } from 'ts-maps'
import type { ControlPosition } from './controls'
import { useEffect, useRef } from 'react'
import { LOOK_AROUND_EVENTS, LookAround as TsLookAround } from 'ts-maps'
import { useMap } from './useMap'

/* eslint-disable no-unused-vars */
export interface LookAroundEventProps {
  /** The viewer opened: `{ image }`. */
  onOpen?: (e: any) => void
  /** The viewer closed. */
  onClose?: (e: any) => void
  /** Another picture is showing: `{ image }`. */
  onImageChange?: (e: any) => void
  /** Looked another way: `{ heading, pitch, fov }`. */
  onViewChange?: (e: any) => void
  /** The streets with pictures were shown or hidden: `{ choosing }`. */
  onChoosingChange?: (e: any) => void
  /** No picture near a tap or `at`: `{ at }`. */
  onNotFound?: (e: any) => void
}
/* eslint-enable no-unused-vars */

export interface LookAroundProps extends LookAroundEventProps {
  /** Where pictures come from: `new PanoramaxImagery()` (the default) or `new MapillaryImagery({ accessToken })`. */
  provider?: StreetImageryProvider
  position?: ControlPosition
  /** The small map in the viewer's corner. Default true. */
  miniMap?: boolean
  /** The language of its words. Default the map's `locale`, else the browser's. */
  locale?: string
  title?: string
  /** Show the streets with pictures and wait for a tap. */
  choosing?: boolean
  /** Look from the picture nearest here; `null` to close. */
  at?: LatLngLike | null
  /** The way to look, compass degrees. */
  heading?: number
  /** The underlying control, for `open`, `close`, `setView` and `step`, and for `<Search lookAround>`. */
  // eslint-disable-next-line no-unused-vars
  onReady?: (control: TsLookAround) => void
}

/**
 * Look Around, after Apple Maps: a binoculars button that shows the streets
 * with pictures, and a full-bleed viewer to turn in and walk through them.
 *
 * ```tsx
 * <Map center={[48.8606, 2.3376]} zoom={16}>
 *   <LookAround onReady={setLook} at={at} onClose={() => setAt(null)} />
 *   <Search lookAround={look} />
 * </Map>
 * ```
 *
 * `provider`, `position`, `choosing`, `at` and `heading` are followed as they
 * change; `choosing`, `at` and `heading` only when they change, so the viewer
 * closed by its own Done stays closed. `miniMap`, `locale` and `title` are
 * read when the control is made: a new one makes it again. Keep a provider's
 * identity stable across renders.
 */
export function LookAround(props: LookAroundProps): null {
  const map = useMap()
  const controlRef = useRef<TsLookAround | null>(null)
  const latest = useRef(props)
  latest.current = props

  const { miniMap, locale, title } = props
  useEffect(() => {
    const { provider, position } = latest.current
    const look = new TsLookAround({ provider, position, miniMap, locale, title })
    look.addTo(map)
    const stop = look.listen((type, e) => (latest.current as any)[LOOK_AROUND_EVENTS[type]]?.(e))
    controlRef.current = look
    latest.current.onReady?.(look)
    return () => {
      stop()
      look.remove()
      controlRef.current = null
    }
  }, [map, miniMap, locale, title])

  // `at` is compared by value, so an inline position is not a change on
  // every render.
  const { provider, position, choosing, at, heading } = props
  const atKey = JSON.stringify(at)
  useEffect(() => {
    controlRef.current?.sync({ provider, position, choosing, at, heading })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, miniMap, locale, title, provider, position, choosing, atKey, heading])

  return null
}
