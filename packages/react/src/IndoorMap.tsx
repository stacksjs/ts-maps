import type { IMDFSource, IndoorVenue, SearchControl } from 'ts-maps'
import type { ControlPosition } from './controls'
import { useEffect, useRef } from 'react'
import { INDOOR_EVENTS, IndoorMap as TsIndoorMap } from 'ts-maps'
import { useMap } from './useMap'

/* eslint-disable no-unused-vars */
export interface IndoorMapEventProps {
  /** The venue loaded: `{ venue }`. */
  onLoad?: (e: any) => void
  /** Another level is showing: `{ level, name }`. */
  onLevelChange?: (e: any) => void
  /** The venue came into view close enough to see inside, or left it: `{ visible }`. */
  onVisibilityChange?: (e: any) => void
}
/* eslint-enable no-unused-vars */

export interface IndoorMapProps extends IndoorMapEventProps {
  /** The venue: an IMDF `.zip` URL, a folder URL, its bytes, its files, or a loaded `IndoorVenue`. */
  venue: IndoorVenue | IMDFSource
  /** The level showing, by ordinal. Default the ground floor. */
  level?: number
  position?: ControlPosition
  /** Zoom below which the plan and the picker are hidden. Default 16. */
  minZoom?: number
  /** The language names are read in. Default English. */
  language?: string
  /** A `SearchControl` — from `<Search onReady>` — to find the venue's places, and go to a chosen one's level. */
  search?: SearchControl
  /** The underlying control, for `setLevel`, `search` and `levels`. */
  // eslint-disable-next-line no-unused-vars
  onReady?: (control: TsIndoorMap) => void
}

/**
 * An indoor map, after Apple Maps: zoomed in on an airport or a mall, its
 * IMDF floor plan is drawn over the map one level at a time, with a level
 * picker beside it.
 *
 * ```tsx
 * <Map center={[37.6155, -122.3866]} zoom={17}>
 *   <Search onReady={setSearch} />
 *   <IndoorMap venue="/imdf/sfo.zip" search={search} level={level} onLevelChange={e => setLevel(e.level)} />
 * </Map>
 * ```
 *
 * `level`, `position` and `search` are followed as they change. `venue`,
 * `minZoom` and `language` are read when the control is made: a new one
 * makes it again, so keep a venue's identity stable across renders.
 */
export function IndoorMap(props: IndoorMapProps): null {
  const map = useMap()
  const controlRef = useRef<TsIndoorMap | null>(null)
  const latest = useRef(props)
  latest.current = props

  const { venue, minZoom, language } = props
  useEffect(() => {
    const { level, position } = latest.current
    const indoor = new TsIndoorMap({ venue, level, position, minZoom, language })
    indoor.addTo(map)
    const stop = indoor.listen((type, e) => (latest.current as any)[INDOOR_EVENTS[type]]?.(e))
    controlRef.current = indoor
    latest.current.onReady?.(indoor)
    // A level asked for while the venue was loading is shown once it has.
    indoor.ready().then(() => {
      if (controlRef.current === indoor)
        indoor.sync({ level: latest.current.level })
    }, () => {})
    return () => {
      stop()
      indoor.remove()
      controlRef.current = null
    }
  }, [map, venue, minZoom, language])

  const { level, position } = props
  useEffect(() => {
    controlRef.current?.sync({ level, position })
  }, [map, venue, minZoom, language, level, position])

  // Runs after the control is made, so a new venue is connected again.
  const { search } = props
  useEffect(() => {
    if (!search || !controlRef.current)
      return
    return controlRef.current.connect(search)
  }, [map, venue, minZoom, language, search])

  return null
}
