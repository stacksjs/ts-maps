<script lang="ts">
  import { onDestroy, onMount, setContext } from 'svelte'
  import { TsMap } from 'ts-maps'
  import { MAP_CONTEXT_KEY, type MapContextValue } from './context'
  import { syncEvents, unbindEvents } from './eventProps'
  import { type Applied, followBearing, followCamera, followPitch, followStyle } from './follow'

  /** Map center as `[lat, lng]`. Followed: a new value moves the map. */
  export let center: [number, number] | undefined = undefined
  export let zoom: number | undefined = undefined
  export let bearing: number | undefined = undefined
  export let pitch: number | undefined = undefined
  /**
   * The map's style: a style object, such as `styles.light({ url })`, or a
   * stylesheet URL. A new one is set with `setStyle`.
   */
  export let style: object | string | undefined = undefined
  /**
   * The language the built-in controls speak, unless one has its own
   * `locale`. Default the browser's. A change reaches each control the next
   * time it draws its words; give the control its own `locale` to relabel it
   * at once.
   */
  export let locale: string | undefined = undefined
  /** CSS for the container div, after its default `width:100%;height:100%`. */
  export let containerStyle: string | undefined = undefined
  /** A class for the container div, next to `ts-map`. */
  let className: string | undefined = undefined
  export { className as class }
  /** Called with the `TsMap` once it is built. The map's `load` event is `onLoadEvent`. */
  export let onLoad: ((map: TsMap) => void) | undefined = undefined

  // Map events, with the same names as the React and Solid bindings. See
  // eventProps.ts for the event each one stands for.
  /* eslint-disable no-unused-vars */
  export let onClick: ((e: any) => void) | undefined = undefined
  export let onDblClick: ((e: any) => void) | undefined = undefined
  export let onMouseDown: ((e: any) => void) | undefined = undefined
  export let onMouseUp: ((e: any) => void) | undefined = undefined
  export let onMouseOver: ((e: any) => void) | undefined = undefined
  export let onMouseOut: ((e: any) => void) | undefined = undefined
  export let onMouseMove: ((e: any) => void) | undefined = undefined
  export let onContextMenu: ((e: any) => void) | undefined = undefined
  export let onFocus: ((e: any) => void) | undefined = undefined
  export let onBlur: ((e: any) => void) | undefined = undefined
  export let onPreclick: ((e: any) => void) | undefined = undefined
  export let onLoadEvent: ((e: any) => void) | undefined = undefined
  export let onUnload: ((e: any) => void) | undefined = undefined
  export let onViewReset: ((e: any) => void) | undefined = undefined
  export let onMove: ((e: any) => void) | undefined = undefined
  export let onMoveStart: ((e: any) => void) | undefined = undefined
  export let onMoveEnd: ((e: any) => void) | undefined = undefined
  export let onDrag: ((e: any) => void) | undefined = undefined
  export let onDragStart: ((e: any) => void) | undefined = undefined
  export let onDragEnd: ((e: any) => void) | undefined = undefined
  export let onZoom: ((e: any) => void) | undefined = undefined
  export let onZoomStart: ((e: any) => void) | undefined = undefined
  export let onZoomEnd: ((e: any) => void) | undefined = undefined
  export let onZoomLevelsChange: ((e: any) => void) | undefined = undefined
  export let onResize: ((e: any) => void) | undefined = undefined
  export let onAutoPanStart: ((e: any) => void) | undefined = undefined
  export let onLayerAdd: ((e: any) => void) | undefined = undefined
  export let onLayerRemove: ((e: any) => void) | undefined = undefined
  export let onBaseLayerChange: ((e: any) => void) | undefined = undefined
  export let onOverlayAdd: ((e: any) => void) | undefined = undefined
  export let onOverlayRemove: ((e: any) => void) | undefined = undefined
  export let onLocationFound: ((e: any) => void) | undefined = undefined
  export let onLocationError: ((e: any) => void) | undefined = undefined
  export let onPopupOpen: ((e: any) => void) | undefined = undefined
  export let onPopupClose: ((e: any) => void) | undefined = undefined
  export let onTooltipOpen: ((e: any) => void) | undefined = undefined
  export let onTooltipClose: ((e: any) => void) | undefined = undefined
  export let onStyleLoad: ((e: any) => void) | undefined = undefined
  export let onStyleDataLoading: ((e: any) => void) | undefined = undefined
  /* eslint-enable no-unused-vars */

  let container: HTMLDivElement | null = null
  let map: TsMap | null = null

  setContext<MapContextValue>(MAP_CONTEXT_KEY, { getMap: () => map })

  // What the map was last given; see follow.ts.
  const applied: Applied = {}
  const bound: Record<string, (e: any) => void> = {}
  const loadState = { loadTold: false }

  onMount(() => {
    if (!container) return
    const options: Record<string, unknown> = {}
    if (center !== undefined) options.center = center
    if (zoom !== undefined) options.zoom = zoom
    if (bearing !== undefined) options.bearing = bearing
    if (pitch !== undefined) options.pitch = pitch
    if (style !== undefined) options.style = style
    if (locale !== undefined) options.locale = locale
    Object.assign(applied, { center, zoom, bearing, pitch, style })
    const instance = new TsMap(container, options)
    // Bound before anything else can run: a style given to the constructor
    // fires `style.load` a microtask later.
    syncEvents(instance, handlers, () => handlers, bound, loadState)
    map = instance
    onLoad?.(instance)
  })

  $: handlers = {
    onClick,
    onDblClick,
    onMouseDown,
    onMouseUp,
    onMouseOver,
    onMouseOut,
    onMouseMove,
    onContextMenu,
    onFocus,
    onBlur,
    onPreclick,
    onLoadEvent,
    onUnload,
    onViewReset,
    onMove,
    onMoveStart,
    onMoveEnd,
    onDrag,
    onDragStart,
    onDragEnd,
    onZoom,
    onZoomStart,
    onZoomEnd,
    onZoomLevelsChange,
    onResize,
    onAutoPanStart,
    onLayerAdd,
    onLayerRemove,
    onBaseLayerChange,
    onOverlayAdd,
    onOverlayRemove,
    onLocationFound,
    onLocationError,
    onPopupOpen,
    onPopupClose,
    onTooltipOpen,
    onTooltipClose,
    onStyleLoad,
    onStyleDataLoading,
  } as Record<string, ((e: any) => void) | undefined>

  $: if (map) syncEvents(map, handlers, () => handlers, bound, loadState)
  $: if (map) followCamera(map, center, zoom, applied)
  $: if (map) followBearing(map, bearing, applied)
  $: if (map) followPitch(map, pitch, applied)
  $: if (map) followStyle(map, style, applied)
  $: if (map) map.options.locale = locale

  onDestroy(() => {
    if (map) unbindEvents(map, bound)
    try {
      ;(map as unknown as { remove?: () => void } | null)?.remove?.()
    }
    catch {
      // ignore — host is being torn down
    }
    map = null
  })
</script>

<div
  bind:this={container}
  class={className ? `ts-map ${className}` : 'ts-map'}
  style="width:100%;height:100%;{containerStyle ?? ''}"
>
  {#if map}
    <slot />
  {/if}
</div>
