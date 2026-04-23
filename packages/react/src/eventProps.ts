/**
 * Maps React-style camelCase event props (e.g. `onStyleLoad`) to the
 * underlying `TsMap` event names (e.g. `styleload`). We do this up front so
 * binding logic stays a flat loop.
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
  onStyleLoad: 'styleload',
  onStyleDataLoading: 'styledataloading',
}

export interface MapEventProps {
  onClick?: (e: any) => void
  onDblClick?: (e: any) => void
  onMouseDown?: (e: any) => void
  onMouseUp?: (e: any) => void
  onMouseOver?: (e: any) => void
  onMouseOut?: (e: any) => void
  onMouseMove?: (e: any) => void
  onContextMenu?: (e: any) => void
  onFocus?: (e: any) => void
  onBlur?: (e: any) => void
  onPreclick?: (e: any) => void
  onLoadEvent?: (e: any) => void
  onUnload?: (e: any) => void
  onViewReset?: (e: any) => void
  onMove?: (e: any) => void
  onMoveStart?: (e: any) => void
  onMoveEnd?: (e: any) => void
  onDrag?: (e: any) => void
  onDragStart?: (e: any) => void
  onDragEnd?: (e: any) => void
  onZoom?: (e: any) => void
  onZoomStart?: (e: any) => void
  onZoomEnd?: (e: any) => void
  onZoomLevelsChange?: (e: any) => void
  onResize?: (e: any) => void
  onAutoPanStart?: (e: any) => void
  onLayerAdd?: (e: any) => void
  onLayerRemove?: (e: any) => void
  onBaseLayerChange?: (e: any) => void
  onOverlayAdd?: (e: any) => void
  onOverlayRemove?: (e: any) => void
  onLocationFound?: (e: any) => void
  onLocationError?: (e: any) => void
  onPopupOpen?: (e: any) => void
  onPopupClose?: (e: any) => void
  onTooltipOpen?: (e: any) => void
  onTooltipClose?: (e: any) => void
  onStyleLoad?: (e: any) => void
  onStyleDataLoading?: (e: any) => void
}
