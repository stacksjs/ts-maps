import type { JSX } from 'solid-js'
import type { OfflineMapsControlOptions, OfflineMaps as TsOfflineMapsManager } from 'ts-maps'
import type { ControlPosition } from './controls'
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js'
import { OFFLINE_MAPS_EVENTS, OfflineMapsControl } from 'ts-maps'
import { useMap } from './context'

/* eslint-disable no-unused-vars */
export interface OfflineMapsProps {
  /** Show the panel — the list of downloaded maps. */
  open?: boolean
  /** Never go to the network for map data. */
  onlyOffline?: boolean
  position?: ControlPosition
  /** The manager to show. Default: the page's, `offlineMaps()`. */
  maps?: TsOfflineMapsManager
  /** Names a new area by reverse geocoding its centre. */
  geocoder?: OfflineMapsControlOptions['geocoder']
  /** Other URLs to keep with every download, such as a TileJSON. */
  resources?: string[]
  /** The pill shown when the connection drops. Default true. */
  showStatus?: boolean
  title?: string
  /** The language its words are in. Default the map's `locale`, else the browser's. */
  locale?: string
  /** The underlying control; `control.maps` is the manager. */
  onReady?: (control: OfflineMapsControl) => void
  onChange?: (e: any) => void
  onProgress?: (e: any) => void
  onComplete?: (e: any) => void
  onError?: (e: any) => void
  onDelete?: (e: any) => void
  onModeChange?: (e: any) => void
  onOpenChange?: (e: any) => void
}
/* eslint-enable no-unused-vars */

/**
 * Offline maps, after Apple Maps: a button opening the list of downloaded
 * maps, an area picker with an estimated size, and a pill when the
 * connection drops.
 *
 * ```tsx
 * <Map center={[37.78, -122.42]} zoom={13}>
 *   <OfflineMaps open={showOffline()} onOpenChange={e => setShowOffline(e.open)} />
 * </Map>
 * ```
 *
 * Every prop is followed as it changes: a new `maps` moves the panel and its
 * events onto that manager, a new `position` moves the button.
 */
export function OfflineMaps(props: OfflineMapsProps): JSX.Element {
  let offline: OfflineMapsControl | null = null
  let unlisten: (() => void) | null = null
  const [control, setControl] = createSignal<OfflineMapsControl | null>(null)

  // An effect rather than onMount: the map arrives through a signal. The
  // options are read untracked here; the effects below follow them.
  createEffect(() => {
    const map = useMap()
    if (!map || offline)
      return
    offline = untrack(() => new OfflineMapsControl({
      position: props.position,
      maps: props.maps,
      geocoder: props.geocoder,
      resources: props.resources,
      showStatus: props.showStatus,
      title: props.title,
      locale: props.locale,
    }))
    offline.addTo(map)
    unlisten = offline.listen((type, e) => (props as any)[OFFLINE_MAPS_EVENTS[type]]?.(e))
    props.onReady?.(offline)
    setControl(offline)
  })

  // Every option is followed; the control does nothing for one that has not
  // changed.
  createEffect(() => {
    const target = {
      position: props.position,
      maps: props.maps,
      geocoder: props.geocoder,
      resources: props.resources,
      showStatus: props.showStatus,
      title: props.title,
      locale: props.locale,
    }
    control()?.sync(target)
  })

  // `open` and `onlyOffline` each on their own: the panel closes, and the
  // mode switches, from inside the control too, and another prop changing
  // should not undo that. A new `maps` is put into the mode asked for.
  createEffect(() => {
    const target = { open: props.open }
    control()?.sync(target)
  })
  createEffect(() => {
    const target = { maps: props.maps, onlyOffline: props.onlyOffline }
    control()?.sync(target)
  })

  onCleanup(() => {
    unlisten?.()
    offline?.remove()
    offline = null
  })

  return null as unknown as JSX.Element
}
