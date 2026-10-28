import { LatLngBounds } from '../geo/LatLngBounds'
import type { Layer } from './Layer'
import { LayerGroup } from './LayerGroup'
import { Polyline } from './vector/Polyline'
import { CircleMarker } from './vector/CircleMarker'

export type LiveRoutePosition = [number, number]
export interface LiveRouteLayerOptions {
  color?: string
  casingColor?: string
  weight?: number
  headColor?: string
}

function valid(point: unknown): point is LiveRoutePosition {
  return Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Math.abs(point[0]) <= 90 && Number.isFinite(point[1]) && Math.abs(point[1]) <= 180
}

/**
 * A changing route plus a separately controlled current position. Coordinates
 * use [latitude, longitude], as Polyline does. Segment boundaries retain GPS
 * gaps and privacy cuts; updates reuse layers and leave the camera untouched.
 */
export class LiveRouteLayer extends LayerGroup {
  declare _route: Polyline
  declare _casing: Polyline
  declare _head: CircleMarker | null
  declare _headPosition: LiveRoutePosition | null

  initialize(input: LiveRouteLayerOptions | Layer[] = {}): void {
    const options = Array.isArray(input) ? {} : input
    super.initialize([], options)
    const weight = options.weight ?? 4.5
    this._casing = new Polyline([], { color: options.casingColor ?? '#ffffff', weight: weight + 3.5, opacity: 0.9, interactive: false })
    this._route = new Polyline([], { color: options.color ?? '#2563eb', weight, interactive: false })
    this._head = null
    this._headPosition = null
    this.addLayer(this._casing)
    this.addLayer(this._route)
  }

  /** Invalid fixes break a line, rather than connecting over missing ground. */
  update(segments: readonly (readonly LiveRoutePosition[])[], position: LiveRoutePosition | null = null): this {
    const clean: LiveRoutePosition[][] = []
    for (const segment of segments) {
      let part: LiveRoutePosition[] = []
      for (const point of segment) {
        if (valid(point)) part.push([point[0], point[1]])
        else {
          if (part.length > 1) clean.push(part)
          part = []
        }
      }
      if (part.length > 1) clean.push(part)
    }
    this._casing.setLatLngs(clean)
    this._route.setLatLngs(clean)
    this._headPosition = valid(position) ? [...position] : null
    if (!this._headPosition) {
      if (this._head) this.removeLayer(this._head)
      this._head = null
    }
    else if (this._head) this._head.setLatLng(this._headPosition)
    else {
      const options = this.options as LiveRouteLayerOptions
      this._head = new CircleMarker(this._headPosition, { radius: 8, color: options.casingColor ?? '#ffffff', weight: 3, fillColor: options.headColor ?? options.color ?? '#2563eb', fillOpacity: 1, interactive: false })
      this.addLayer(this._head)
    }
    return this
  }

  /** Includes a single starting fix even when there is no line to draw yet. */
  getBounds(): LatLngBounds {
    const bounds = new LatLngBounds()
    if (!this._route.isEmpty()) bounds.extend(this._route.getBounds())
    if (this._headPosition) bounds.extend(this._headPosition)
    return bounds
  }
}

export function liveRouteLayer(options?: LiveRouteLayerOptions): LiveRouteLayer {
  return new LiveRouteLayer(options)
}
