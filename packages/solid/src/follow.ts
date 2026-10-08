import type { Map as MapInstance } from 'ts-maps'

/**
 * What `<Map>` last gave the map. A prop is passed on when its value
 * changes, not each time the component updates: a parent that re-renders
 * with the same `center` must not undo a pan the user made.
 */
export interface Applied {
  center?: [number, number]
  zoom?: number
  bearing?: number
  pitch?: number
  style?: unknown
}

export function followCamera(map: MapInstance, center: [number, number] | undefined, zoom: number | undefined, applied: Applied): void {
  const sameCenter = center?.[0] === applied.center?.[0] && center?.[1] === applied.center?.[1]
  if (sameCenter && zoom === applied.zoom)
    return
  applied.center = center ? [center[0], center[1]] : undefined
  applied.zoom = zoom
  if (center !== undefined && zoom !== undefined)
    map.setView(center, zoom)
  // A map with no view yet needs both.
  else if (!(map as unknown as { _loaded?: boolean })._loaded)
    return
  else if (center !== undefined)
    map.setView(center, map.getZoom())
  else if (zoom !== undefined)
    map.setZoom(zoom)
}

export function followBearing(map: MapInstance, bearing: number | undefined, applied: Applied): void {
  if (bearing === undefined || bearing === applied.bearing)
    return
  applied.bearing = bearing
  map.setBearing(bearing)
}

export function followPitch(map: MapInstance, pitch: number | undefined, applied: Applied): void {
  if (pitch === undefined || pitch === applied.pitch)
    return
  applied.pitch = pitch
  map.setPitch(pitch)
}

export function followStyle(map: MapInstance, style: object | string | undefined, applied: Applied): void {
  if (style === undefined || style === applied.style)
    return
  applied.style = style
  map.setStyle(style as Parameters<MapInstance['setStyle']>[0])
}
