import type { OfflineMapsControlOptions, OfflineMaps as TsOfflineMapsManager } from 'ts-maps'
import type { ControlPosition } from './controls'
import { useEffect, useRef } from 'react'
import { OFFLINE_MAPS_EVENTS, OfflineMapsControl } from 'ts-maps'
import { useMap } from './useMap'

/* eslint-disable no-unused-vars */
export interface OfflineMapsEventProps {
  /** The list of downloaded maps changed: `{ regions }`. */
  onChange?: (e: any) => void
  /** A download moved on: `{ region }`. */
  onProgress?: (e: any) => void
  /** A download finished: `{ region }`. */
  onComplete?: (e: any) => void
  /** A download failed: `{ region, error }`. */
  onError?: (e: any) => void
  /** A downloaded map was deleted: `{ id }`. */
  onDelete?: (e: any) => void
  /** "Only Use Offline Maps" was switched: `{ onlyOffline }`. */
  onModeChange?: (e: any) => void
  /** The panel opened or closed: `{ open }`. */
  onOpenChange?: (e: any) => void
}
/* eslint-enable no-unused-vars */

export interface OfflineMapsProps extends OfflineMapsEventProps {
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
  /** The underlying control; `control.maps` is the manager, for `download`, `list` and the rest. */
  // eslint-disable-next-line no-unused-vars
  onReady?: (control: OfflineMapsControl) => void
}

/**
 * Offline maps, after Apple Maps: a button opening the list of downloaded
 * maps, an area picker with an estimated size, and a pill when the
 * connection drops.
 *
 * ```tsx
 * <Map center={[37.78, -122.42]} zoom={13}>
 *   <OfflineMaps onComplete={({ region }) => toast(`${region.name} is ready offline`)} />
 * </Map>
 * ```
 *
 * Options are read when the component mounts; `open` and `onlyOffline` are
 * followed as they change.
 */
export function OfflineMaps(props: OfflineMapsProps): null {
  const map = useMap()
  const controlRef = useRef<OfflineMapsControl | null>(null)
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const { position, maps, geocoder, resources, showStatus, title } = latest.current
    const offline = new OfflineMapsControl({ position, maps, geocoder, resources, showStatus, title })
    offline.addTo(map)
    const stop = offline.listen((type, e) => (latest.current as any)[OFFLINE_MAPS_EVENTS[type]]?.(e))
    controlRef.current = offline
    latest.current.onReady?.(offline)
    return () => {
      stop()
      offline.remove()
      controlRef.current = null
    }
  }, [map])

  const { open, onlyOffline } = props
  useEffect(() => {
    controlRef.current?.sync({ open, onlyOffline })
  }, [map, open, onlyOffline])

  return null
}
