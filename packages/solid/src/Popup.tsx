import type { JSX } from 'solid-js'
import type { Popup as PopupClass } from 'ts-maps'
import { createEffect, onCleanup, onMount } from 'solid-js'
import { popup } from 'ts-maps'
import { useMap } from './context'

export interface PopupProps {
  /** `[lat, lng]`. Followed. */
  position?: [number, number]
  /** HTML content. Followed. */
  content?: string
  /** Anything the core `Popup` takes: `maxWidth`, `closeButton`, `className`, … Read once. */
  options?: Record<string, unknown>
}

export function Popup(props: PopupProps): JSX.Element {
  // Read in the body: the context is not there in onCleanup.
  const map = useMap()
  let instance: PopupClass | null = null

  onMount(() => {
    if (!map)
      return
    const p = popup(props.options) as PopupClass
    if (props.position)
      p.setLatLng(props.position)
    if (props.content)
      p.setContent(props.content)
    ;(p as unknown as { addTo: (m: unknown) => void }).addTo(map)
    instance = p
  })

  createEffect(() => {
    const to = props.position
    if (instance && to)
      instance.setLatLng(to)
  })

  createEffect(() => {
    const content = props.content
    if (instance && content !== undefined)
      instance.setContent(content)
  })

  onCleanup(() => {
    instance?.remove?.()
    instance = null
  })

  return null
}
