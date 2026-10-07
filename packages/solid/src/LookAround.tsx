import type { JSX } from 'solid-js'
import type { LatLngLike, StreetImageryProvider } from 'ts-maps'
import type { ControlPosition } from './controls'
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js'
import { LOOK_AROUND_EVENTS, LookAround as TsLookAround } from 'ts-maps'
import { useMap } from './context'

/* eslint-disable no-unused-vars */
export interface LookAroundProps {
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
  onReady?: (control: TsLookAround) => void
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

/**
 * Look Around, after Apple Maps: a binoculars button that shows the streets
 * with pictures, and a full-bleed viewer to turn in and walk through them.
 *
 * ```tsx
 * <Map center={[48.8606, 2.3376]} zoom={16}>
 *   <LookAround onReady={setLook} at={at()} onClose={() => setAt(null)} />
 *   <Search lookAround={look()} />
 * </Map>
 * ```
 *
 * `provider`, `position`, `choosing`, `at` and `heading` are followed as they
 * change; `choosing`, `at` and `heading` only when they change, so the viewer
 * closed by its own Done stays closed. `miniMap`, `locale` and `title` are
 * read when the control is made: a new one makes it again.
 */
export function LookAround(props: LookAroundProps): JSX.Element {
  const [control, setControl] = createSignal<TsLookAround | null>(null)

  // An effect rather than onMount: the map arrives through a signal. It runs
  // again for a new `miniMap`, `locale` or `title`, making the control again;
  // the other options are read untracked here, and followed below.
  createEffect(() => {
    const map = useMap()
    const { miniMap, locale, title } = props
    if (!map)
      return
    const look = untrack(() => new TsLookAround({ provider: props.provider, position: props.position, miniMap, locale, title }))
    look.addTo(map)
    const unlisten = look.listen((type, e) => (props as any)[LOOK_AROUND_EVENTS[type]]?.(e))
    untrack(() => props.onReady?.(look))
    setControl(look)
    onCleanup(() => {
      unlisten()
      look.remove()
      setControl(null)
    })
  })

  createEffect(() => {
    const target = { provider: props.provider, position: props.position, choosing: props.choosing, at: props.at, heading: props.heading }
    control()?.sync(target)
  })

  return null as unknown as JSX.Element
}
