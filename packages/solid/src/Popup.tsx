import type { JSX } from 'solid-js'
import type { Popup as PopupClass } from 'ts-maps'
import { onCleanup, onMount } from 'solid-js'
import { popup } from 'ts-maps'
import { useMap } from './context'

export interface PopupProps {
  position?: [number, number]
  content?: string
}

export function Popup(props: PopupProps): JSX.Element {
  let instance: PopupClass | null = null

  onMount(() => {
    const map = useMap()
    if (!map)
      return
    const p = popup() as PopupClass
    if (props.position)
      (p as unknown as { setLatLng: (l: [number, number]) => void }).setLatLng(props.position)
    if (props.content)
      (p as unknown as { setContent: (c: string) => void }).setContent(props.content)
    ;(p as unknown as { addTo: (m: unknown) => void }).addTo(map)
    instance = p
  })

  onCleanup(() => {
    instance?.remove?.()
    instance = null
  })

  return null
}
