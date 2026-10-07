import type { JSX } from 'solid-js'
import type { IMDFSource, IndoorVenue, SearchControl } from 'ts-maps'
import type { ControlPosition } from './controls'
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js'
import { INDOOR_EVENTS, IndoorMap as TsIndoorMap } from 'ts-maps'
import { useMap } from './context'

/* eslint-disable no-unused-vars */
export interface IndoorMapProps {
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
  onReady?: (control: TsIndoorMap) => void
  /** The venue loaded: `{ venue }`. */
  onLoad?: (e: any) => void
  /** Another level is showing: `{ level, name }`. */
  onLevelChange?: (e: any) => void
  /** The venue came into view close enough to see inside, or left it: `{ visible }`. */
  onVisibilityChange?: (e: any) => void
}
/* eslint-enable no-unused-vars */

/**
 * An indoor map, after Apple Maps: zoomed in on an airport or a mall, its
 * IMDF floor plan is drawn over the map one level at a time, with a level
 * picker beside it.
 *
 * ```tsx
 * <Map center={[37.6155, -122.3866]} zoom={17}>
 *   <Search onReady={setSearch} />
 *   <IndoorMap venue="/imdf/sfo.zip" search={search()} level={level()} onLevelChange={e => setLevel(e.level)} />
 * </Map>
 * ```
 *
 * `level`, `position` and `search` are followed as they change. `venue`,
 * `minZoom` and `language` are read when the control is made: a new one
 * makes it again.
 */
export function IndoorMap(props: IndoorMapProps): JSX.Element {
  const [control, setControl] = createSignal<TsIndoorMap | null>(null)

  // An effect rather than onMount: the map arrives through a signal. It runs
  // again for a new venue, making the control again; the other options are
  // read untracked here, and followed below.
  createEffect(() => {
    const map = useMap()
    const { venue, minZoom, language } = props
    if (!map)
      return
    const indoor = untrack(() => new TsIndoorMap({ venue, level: props.level, position: props.position, minZoom, language }))
    indoor.addTo(map)
    const unlisten = indoor.listen((type, e) => (props as any)[INDOOR_EVENTS[type]]?.(e))
    untrack(() => props.onReady?.(indoor))
    setControl(indoor)
    // A level asked for while the venue was loading is shown once it has.
    indoor.ready().then(() => {
      if (untrack(control) === indoor)
        indoor.sync({ level: untrack(() => props.level) })
    }, () => {})
    onCleanup(() => {
      unlisten()
      indoor.remove()
      setControl(null)
    })
  })

  createEffect(() => {
    const target = { level: props.level, position: props.position }
    control()?.sync(target)
  })

  createEffect(() => {
    const indoor = control()
    const search = props.search
    if (indoor && search)
      onCleanup(indoor.connect(search))
  })

  return null as unknown as JSX.Element
}
