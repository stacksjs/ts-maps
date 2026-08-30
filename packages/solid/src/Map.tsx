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

  // Children go in a wrapper of their own rather than straight into the map
  // container. Solid's `insert` treats a parent whose content it manages as
  // its to clear, and the map fills that container with panes the moment it is
  // created — so putting the children slot directly inside meant every pane
  // was wiped the instant `map()` flipped from null. `display: contents`
  // keeps the wrapper out of the layout entirely.
  //
  // A callback ref rather than `ref={container}`. The bare-variable form
  // depends on Solid's compiler recognising the variable and rewriting the
  // assignment, which it does not do under every configuration — and when it
  // does not, the ref is silently never set and the map never mounts. Written
  // this way it works the same however the JSX was compiled.
  const setContainer = (el: HTMLDivElement): void => {
    container = el
  }

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
      <div ref={setContainer} class={props.class} style={props.style}>
        <div style={{ display: 'contents' }}>
          {map() ? props.children : null}
        </div>
      </div>
    </MapContext.Provider>
  )
}
