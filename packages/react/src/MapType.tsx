import type { MapTypeControlOptions, MapTypeOption } from 'ts-maps'
import type { ControlPosition } from './controls'
import { useEffect, useRef } from 'react'
import { MAP_TYPE_EVENTS, MapTypeControl } from 'ts-maps'
import { useMap } from './useMap'

/* eslint-disable no-unused-vars */
export interface MapTypeEventProps {
  /** A map type was chosen: `{ value }`. */
  onChange?: (e: any) => void
  /** The card opened or closed: `{ open }`. */
  onOpenChange?: (e: any) => void
  /** The card's Traffic switch was turned: `{ traffic }`. */
  onTrafficChange?: (e: any) => void
}
/* eslint-enable no-unused-vars */

export interface MapTypeProps extends MapTypeEventProps {
  /** The types to offer: `mapTypes({ tiles, imagery })` for Apple's Explore, Driving and Satellite. */
  types: MapTypeOption[]
  /** The type showing. */
  value?: string
  /** Show the card of map types. */
  open?: boolean
  position?: ControlPosition
  title?: string
  /** A `TrafficLayer`, for a Traffic switch on the card. */
  traffic?: MapTypeControlOptions['traffic']
  /** Show traffic, with `traffic`. */
  showTraffic?: boolean
  /** The language of its words. Default the map's `locale`, else the browser's. */
  locale?: string
  /** The underlying control, for `select`. */
  // eslint-disable-next-line no-unused-vars
  onReady?: (control: MapTypeControl) => void
}

/**
 * The map type picker, after Apple Maps: a card of map types, Explore,
 * Driving and Satellite, that sets the map's style and keeps the layers the
 * page added to it.
 *
 * ```tsx
 * const types = useMemo(() => mapTypes({ tiles, imagery }), [tiles])
 * <Map center={[37.78, -122.42]} zoom={13}>
 *   <MapType types={types} value={type} onChange={e => setType(e.value)} />
 * </Map>
 * ```
 *
 * Every prop is followed as it changes.
 */
export function MapType(props: MapTypeProps): null {
  const map = useMap()
  const controlRef = useRef<MapTypeControl | null>(null)
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const { types, value, position, title, traffic, locale } = latest.current
    const picker = new MapTypeControl({ types, value, position, title, traffic, locale })
    picker.addTo(map)
    const stop = picker.listen((type, e) => (latest.current as any)[MAP_TYPE_EVENTS[type]]?.(e))
    controlRef.current = picker
    latest.current.onReady?.(picker)
    return () => {
      stop()
      picker.remove()
      controlRef.current = null
    }
  }, [map])

  const { types, value, open, position, showTraffic, locale } = props
  useEffect(() => {
    controlRef.current?.sync({ types, value, open, position, showTraffic, locale })
  }, [map, types, value, open, position, showTraffic, locale])

  return null
}
