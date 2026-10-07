import type { JSX } from 'solid-js'
import type { MapTypeControlOptions, MapTypeOption } from 'ts-maps'
import type { ControlPosition } from './controls'
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js'
import { MAP_TYPE_EVENTS, MapTypeControl } from 'ts-maps'
import { useMap } from './context'

/* eslint-disable no-unused-vars */
export interface MapTypeProps {
  /** The types to offer: `mapTypes({ tiles, imagery })` for Apple's Explore, Driving and Satellite. */
  types: MapTypeOption[]
  /** The type showing. */
  value?: string
  /** Show the card of map types. */
  open?: boolean
  position?: ControlPosition
  title?: string
  /** A `TrafficLayer`, for a Traffic switch on the card. Read at mount. */
  traffic?: MapTypeControlOptions['traffic']
  /** Show traffic, with `traffic`. */
  showTraffic?: boolean
  /** The underlying control, for `select`. */
  onReady?: (control: MapTypeControl) => void
  /** A map type was chosen: `{ value }`. */
  onChange?: (e: any) => void
  /** The card opened or closed: `{ open }`. */
  onOpenChange?: (e: any) => void
  /** The card's Traffic switch was turned: `{ traffic }`. */
  onTrafficChange?: (e: any) => void
}
/* eslint-enable no-unused-vars */

/**
 * The map type picker, after Apple Maps: a card of map types, Explore,
 * Driving and Satellite, that sets the map's style and keeps the layers the
 * page added to it.
 *
 * ```tsx
 * const types = mapTypes({ tiles, imagery })
 * <Map center={[37.78, -122.42]} zoom={13}>
 *   <MapType types={types} value={type()} onChange={e => setType(e.value)} />
 * </Map>
 * ```
 *
 * Every prop is followed as it changes.
 */
export function MapType(props: MapTypeProps): JSX.Element {
  let picker: MapTypeControl | null = null
  let unlisten: (() => void) | null = null
  const [control, setControl] = createSignal<MapTypeControl | null>(null)

  // An effect rather than onMount: the map arrives through a signal. The
  // options are read untracked here; the effect below follows them.
  createEffect(() => {
    const map = useMap()
    if (!map || picker)
      return
    picker = untrack(() => new MapTypeControl({
      types: props.types,
      value: props.value,
      position: props.position,
      title: props.title,
      traffic: props.traffic,
    }))
    picker.addTo(map)
    unlisten = picker.listen((type, e) => (props as any)[MAP_TYPE_EVENTS[type]]?.(e))
    props.onReady?.(picker)
    setControl(picker)
  })

  // The control follows `value`, `open` and `showTraffic` only when they
  // change, so the card closed by its own ✕ stays closed when another prop
  // changes.
  createEffect(() => {
    const target = { types: props.types, value: props.value, open: props.open, position: props.position, showTraffic: props.showTraffic }
    control()?.sync(target)
  })

  onCleanup(() => {
    unlisten?.()
    picker?.remove()
    picker = null
  })

  return null as unknown as JSX.Element
}
