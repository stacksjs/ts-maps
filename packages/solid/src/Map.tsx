import type { JSX, ParentProps } from 'solid-js'
import type { TsMap as TsMapInstance } from 'ts-maps'
import { createSignal, onCleanup, onMount } from 'solid-js'
import { TsMap } from 'ts-maps'
import { MapContext } from './context'

export interface MapProps {
  center?: [number, number]
  zoom?: number
  bearing?: number
  pitch?: number
  style?: JSX.CSSProperties
  class?: string
}

export function Map(props: ParentProps<MapProps>): JSX.Element {
  const [map, setMap] = createSignal<TsMapInstance | null>(null)
  let container: HTMLDivElement | undefined

  onMount(() => {
    if (!container)
      return
    const options: Record<string, unknown> = {}
    if (props.center !== undefined) options.center = props.center
    if (props.zoom !== undefined) options.zoom = props.zoom
    if (props.bearing !== undefined) options.bearing = props.bearing
    if (props.pitch !== undefined) options.pitch = props.pitch
    const instance = new TsMap(container, options)
    setMap(instance)
  })

  onCleanup(() => {
    const instance = map()
    try {
      ;(instance as unknown as { remove?: () => void } | null)?.remove?.()
    }
    catch {
      // ignore — host is being torn down
    }
    setMap(null)
  })

  return (
    <MapContext.Provider value={map}>
      <div ref={container} class={props.class} style={props.style}>
        {map() ? props.children : null}
      </div>
    </MapContext.Provider>
  )
}
