import type { JSX } from 'solid-js'
import type { OfflineMapsControlOptions, OfflineMaps as TsOfflineMapsManager } from 'ts-maps'
import type { ControlPosition } from './controls'
import { createEffect, onCleanup } from 'solid-js'
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
 * Options are read when the map arrives; `open` and `onlyOffline` are
 * followed as they change.
 */
export function OfflineMaps(props: OfflineMapsProps): JSX.Element {
  let offline: OfflineMapsControl | null = null
  let unlisten: (() => void) | null = null

  // One effect for both: the map arrives through a signal, and the followed
  // props are read here too, so a change to either brings the control into
  // line.
  createEffect(() => {
    const map = useMap()
    const target = { open: props.open, onlyOffline: props.onlyOffline }
    if (!map)
      return
    if (!offline) {
      offline = new OfflineMapsControl({
        position: props.position,
        maps: props.maps,
        geocoder: props.geocoder,
        resources: props.resources,
        showStatus: props.showStatus,
        title: props.title,
      })
      offline.addTo(map)
      unlisten = offline.listen((type, e) => (props as any)[OFFLINE_MAPS_EVENTS[type]]?.(e))
      props.onReady?.(offline)
    }
    offline.sync(target)
  })

  onCleanup(() => {
    unlisten?.()
    offline?.remove()
    offline = null
  })

  return null as unknown as JSX.Element
}
