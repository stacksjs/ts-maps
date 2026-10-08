import type { JSX, ParentProps } from 'solid-js'
import type { MapEventProps } from './eventProps'
import type { Applied } from './follow'
import { createEffect, createSignal, on, onCleanup, onMount } from 'solid-js'
import { Map as MapInstance } from 'ts-maps'
import { MapContext } from './context'
import { syncEvents, unbindEvents } from './eventProps'
import { followBearing, followCamera, followPitch, followStyle } from './follow'

export interface MapProps extends MapEventProps {
  /** Map center as `[lat, lng]`. Followed: a new value moves the map. */
  center?: [number, number]
  zoom?: number
  bearing?: number
  pitch?: number
  /**
   * The map's style: a style object, such as `styles.light({ url })`, or a
   * stylesheet URL. A new one is set with `setStyle`.
   */
  style?: object | string
  /**
   * The language the built-in controls speak, unless one has its own
   * `locale`. Default the browser's. A change reaches each control the next
   * time it draws its words; give the control its own `locale` to relabel it
   * at once.
   */
  locale?: string
  /** CSS for the container div. */
  containerStyle?: JSX.CSSProperties | string
  /** A class for the container div. */
  class?: string
  /** Called with the `Map` once it is built. The map's `load` event is `onLoadEvent`. */
  // eslint-disable-next-line no-unused-vars
  onLoad?: (map: MapInstance) => void
}

type Handlers = Record<string, ((e: any) => void) | undefined>

export function Map(props: ParentProps<MapProps>): JSX.Element {
  const [map, setMap] = createSignal<MapInstance | null>(null)
  let container: HTMLDivElement | undefined

  // What the map was last given; see follow.ts.
  const applied: Applied = {}
  const bound: Record<string, (e: any) => void> = {}
  const loadState = { loadTold: false }
  // The props are the handlers: `props.onClick` is read when a click comes.
  const handlers = (): Handlers => props as unknown as Handlers

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
    if (props.style !== undefined) options.style = props.style
    if (props.locale !== undefined) options.locale = props.locale
    Object.assign(applied, {
      center: options.center,
      zoom: options.zoom,
      bearing: options.bearing,
      pitch: options.pitch,
    })
    const instance = new MapInstance(container, options)
    // Bound before anything else can run: a style given to the constructor
    // fires `style.load` a microtask later.
    syncEvents(instance, handlers(), handlers, bound, loadState)
    setMap(instance)
    props.onLoad?.(instance)
  })

  // Re-read when a handler prop changes: one is added or taken away.
  createEffect(() => {
    const instance = map()
    if (instance)
      syncEvents(instance, handlers(), handlers, bound, loadState)
  })

  createEffect(() => {
    const instance = map()
    const center = props.center
    const zoom = props.zoom
    if (instance)
      followCamera(instance, center, zoom, applied)
  })

  createEffect(() => {
    const instance = map()
    const bearing = props.bearing
    if (instance)
      followBearing(instance, bearing, applied)
  })

  createEffect(() => {
    const instance = map()
    const pitch = props.pitch
    if (instance)
      followPitch(instance, pitch, applied)
  })

  // Only when the prop changes, not on the first run: written inline,
  // `style={styles.light(...)}` makes a new object each time it is read, and
  // the constructor has already had the first one.
  createEffect(on(() => props.style, (style) => {
    const instance = map()
    if (instance)
      followStyle(instance, style, applied)
  }, { defer: true }))

  createEffect(() => {
    const instance = map()
    const locale = props.locale
    if (instance)
      instance.options.locale = locale
  })

  onCleanup(() => {
    const instance = map()
    if (instance)
      unbindEvents(instance, bound)
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
      <div ref={setContainer} class={props.class} style={props.containerStyle}>
        <div style={{ display: 'contents' }}>
          {map() ? props.children : null}
        </div>
      </div>
    </MapContext.Provider>
  )
}
