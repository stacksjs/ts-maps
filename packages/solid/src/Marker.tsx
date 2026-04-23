import type { JSX, ParentProps } from 'solid-js'
import type { Marker as MarkerClass } from 'ts-maps'
import { onCleanup, onMount } from 'solid-js'
import { marker } from 'ts-maps'
import { useMap } from './context'

export interface MarkerProps {
  position: [number, number]
  draggable?: boolean
  title?: string
}

export function Marker(props: ParentProps<MarkerProps>): JSX.Element {
  let instance: MarkerClass | null = null

  onMount(() => {
    const map = useMap()
    if (!map)
      return
    const opts: Record<string, unknown> = {}
    if (props.draggable !== undefined) opts.draggable = props.draggable
    if (props.title !== undefined) opts.title = props.title
    instance = marker(props.position, opts).addTo(map) as MarkerClass
  })

  onCleanup(() => {
    instance?.remove?.()
    instance = null
  })

  return null
}
