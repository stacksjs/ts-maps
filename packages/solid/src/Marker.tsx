import type { JSX, ParentProps } from 'solid-js'
import type { Marker as MarkerClass } from 'ts-maps'
import { createEffect, onCleanup, onMount } from 'solid-js'
import { marker } from 'ts-maps'
import { useMap } from './context'

export interface MarkerProps {
  /** `[lat, lng]`. Followed. */
  position: [number, number]
  /** Anything the core `Marker` takes: `icon`, `draggable`, `title`, `opacity`, … Read once. */
  options?: Record<string, unknown>
  /** Short for `options.draggable`. Read once. */
  draggable?: boolean
  /** Short for `options.title`. Read once. */
  title?: string
  /* eslint-disable no-unused-vars */
  onClick?: (e: any) => void
  onDragEnd?: (e: any) => void
  /* eslint-enable no-unused-vars */
}

/**
 * Adds a `Marker` to the surrounding `<Map>`. Follows `position` and removes
 * itself on cleanup.
 */
export function Marker(props: ParentProps<MarkerProps>): JSX.Element {
  // Read in the body: the context is not there in onCleanup.
  const map = useMap()
  let instance: MarkerClass | null = null

  onMount(() => {
    if (!map)
      return
    const opts: Record<string, unknown> = { ...props.options }
    if (props.draggable !== undefined) opts.draggable = props.draggable
    if (props.title !== undefined) opts.title = props.title
    const m = marker(props.position, opts) as MarkerClass
    // Handlers are read when the event fires, so a new one is honoured.
    m.on('click', (e: any) => props.onClick?.(e))
    m.on('dragend', (e: any) => props.onDragEnd?.(e))
    instance = m.addTo(map) as MarkerClass
  })

  createEffect(() => {
    const to = props.position
    const lat = to?.[0]
    const lng = to?.[1]
    if (!instance || lat === undefined || lng === undefined)
      return
    const at = instance.getLatLng()
    if (at.lat !== lat || at.lng !== lng)
      instance.setLatLng([lat, lng])
  })

  onCleanup(() => {
    instance?.remove?.()
    instance = null
  })

  return null
}
