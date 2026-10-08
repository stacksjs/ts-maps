import type { Map as MapInstance } from 'ts-maps'

/**
 * `<Map>`'s event props and the map events they stand for. The same names as
 * the React and Solid bindings: `onStyleLoad` is `style.load`.
 *
 * `onLoad` is not here: as in React, it hands over the `Map` once the
 * component has built it. The map's own `load` event is `onLoadEvent`.
 */
export const EVENT_PROPS: Readonly<Record<string, string>> = {
  onClick: 'click',
  onDblClick: 'dblclick',
  onMouseDown: 'mousedown',
  onMouseUp: 'mouseup',
  onMouseOver: 'mouseover',
  onMouseOut: 'mouseout',
  onMouseMove: 'mousemove',
  onContextMenu: 'contextmenu',
  onFocus: 'focus',
  onBlur: 'blur',
  onPreclick: 'preclick',
  onLoadEvent: 'load',
  onUnload: 'unload',
  onViewReset: 'viewreset',
  onMove: 'move',
  onMoveStart: 'movestart',
  onMoveEnd: 'moveend',
  onDrag: 'drag',
  onDragStart: 'dragstart',
  onDragEnd: 'dragend',
  onZoom: 'zoom',
  onZoomStart: 'zoomstart',
  onZoomEnd: 'zoomend',
  onZoomLevelsChange: 'zoomlevelschange',
  onResize: 'resize',
  onAutoPanStart: 'autopanstart',
  onLayerAdd: 'layeradd',
  onLayerRemove: 'layerremove',
  onBaseLayerChange: 'baselayerchange',
  onOverlayAdd: 'overlayadd',
  onOverlayRemove: 'overlayremove',
  onLocationFound: 'locationfound',
  onLocationError: 'locationerror',
  onPopupOpen: 'popupopen',
  onPopupClose: 'popupclose',
  onTooltipOpen: 'tooltipopen',
  onTooltipClose: 'tooltipclose',
  onStyleLoad: 'style.load',
  onStyleDataLoading: 'styledataloading',
}

// eslint-disable-next-line no-unused-vars
type Handler = (e: any) => void

/**
 * Keep the map's listeners in step with the event props.
 *
 * One listener per event that has a handler in `current`. It looks the handler
 * up through `handlers` when the event fires, so a new handler takes over
 * without rebinding; a handler that
 * goes away takes its listener with it. `bound` is the component's own record
 * of what it has bound; `state.loadTold` says whether `load` has been handed
 * on for a map that was loaded before anything listened.
 */
export function syncEvents(
  map: MapInstance,
  current: Record<string, Handler | undefined>,
  handlers: () => Record<string, Handler | undefined>,
  bound: Record<string, Handler>,
  state: { loadTold: boolean },
): void {
  for (const [prop, event] of Object.entries(EVENT_PROPS)) {
    const handler = current[prop]
    const listener = bound[prop]
    if (typeof handler === 'function' && !listener) {
      const forward: Handler = (e) => {
        if (event === 'load')
          state.loadTold = true
        handlers()[prop]?.(e)
      }
      map.on(event, forward)
      bound[prop] = forward
    }
    else if (typeof handler !== 'function' && listener) {
      map.off(event, listener)
      delete bound[prop]
    }
    // The map fires `load` from its constructor, before any listener can
    // exist: a map already loaded is told to the first handler now, once.
    if (event === 'load' && typeof handler === 'function' && (map as any)._loaded && !state.loadTold) {
      state.loadTold = true
      queueMicrotask(() => handlers()[prop]?.({ type: 'load', target: map }))
    }
  }
}

/** Take every listener `syncEvents` bound off the map. */
export function unbindEvents(map: MapInstance, bound: Record<string, Handler>): void {
  for (const [prop, listener] of Object.entries(bound)) {
    map.off(EVENT_PROPS[prop], listener)
    delete bound[prop]
  }
}
