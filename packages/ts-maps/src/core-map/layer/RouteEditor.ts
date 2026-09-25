// Drawing and reshaping a route by hand, on the map.
//
// `RouteBuilder` knows what a route is; this is how a person edits one. Tap
// the map to go somewhere next. Drag any waypoint to move it. Drag the line
// itself — or the small handle halfway along each leg — to pull the route
// through somewhere new. Tap a waypoint to drop it. Every change reroutes only
// the legs it touches, and every change can be undone on the builder.
//
//   const builder = new RouteBuilder({ router })
//   new RouteEditor(builder).addTo(map)
//
// On a map that shares its page (`cooperativeGestures`) one finger scrolls the
// page, so on a phone a press on the thin line scrolls rather than pulls it;
// the halfway handles are there so a finger always has something to grab.

import type { RouteBuilder } from '../services/route-builder'
import type { LatLngLike } from '../services/types'
import * as DomEvent from '../dom/DomEvent'
import * as PointerEvents from '../dom/DomEvent.PointerEvents'
import * as Util from '../core/Util'
import { distanceMeters } from '../services/paths'
import { Layer } from './Layer'
import { DivIcon } from './marker/DivIcon'
import { Marker } from './marker/Marker'
import { Polyline } from './vector/Polyline'

export interface RouteEditorOptions {
  /** The line, and the ring round each waypoint. */
  color?: string
  /** The darker edge under the line that keeps it readable on any basemap. */
  casingColor?: string
  weight?: number
  /** Tap the map to add a waypoint at the end. Default true. */
  addOnClick?: boolean
  /** Tap a waypoint to remove it. Default true. */
  removeOnTap?: boolean
  /** A handle halfway along each leg; drag it to add a waypoint there. Default true. */
  midpoints?: boolean
  /** Legs shorter than this on screen get no halfway handle — it would sit on the waypoints. */
  midpointMinPixels?: number
  /** Press and drag the line itself to add a waypoint there. Default true. */
  dragLine?: boolean
}

export type RouteEditAction = 'add' | 'move' | 'insert' | 'remove'

type Kind = 'start' | 'via' | 'end' | 'midpoint' | 'ghost'

/** A handle stands for a point, not an index: indexes shift while a change is still routing. */
interface HandleData {
  kind: Kind
  point: LatLngLike
  /** For a halfway handle, the leg it splits. */
  leg?: [LatLngLike, LatLngLike]
}

interface LineDrag {
  pointerId: number
  leg: [LatLngLike, LatLngLike]
  startX: number
  startY: number
  moved: boolean
  latlng?: LatLngLike
}

const HANDLE_SIZE = 28
const LINE_DRAG_TOLERANCE = 4

function samePoint(a: LatLngLike, b: LatLngLike): boolean {
  return a.lat === b.lat && a.lng === b.lng
}

function plain(latlng: LatLngLike): LatLngLike {
  return { lat: latlng.lat, lng: latlng.lng }
}

/** The point halfway along a line, by distance. */
function halfway(points: LatLngLike[]): LatLngLike {
  const lengths = points.slice(1).map((p, i) => distanceMeters(points[i], p))
  let remaining = lengths.reduce((sum, d) => sum + d, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] ? remaining / lengths[i] : 0
      return {
        lat: points[i].lat + (points[i + 1].lat - points[i].lat) * t,
        lng: points[i].lng + (points[i + 1].lng - points[i].lng) * t,
      }
    }
    remaining -= lengths[i]
  }
  return points[points.length - 1]
}

export class RouteEditor extends Layer {
  declare _builder: RouteBuilder
  declare _casing: Polyline
  declare _line: Polyline
  declare _hit: Polyline
  declare _preview: Polyline
  declare _handles: Marker[]
  declare _midpoints: Marker[]
  declare _ghost: Marker | null
  declare _unsubscribe: (() => void) | null
  declare _lineDrag: LineDrag | null
  /** Drags and dropped changes in flight: the handles stay where the person left them until then. */
  declare _holds: number
  declare _suppressClickUntil: number

  initialize(builder: RouteBuilder, options?: RouteEditorOptions): void {
    Util.setOptions(this as any, options)
    this._builder = builder
    this._handles = []
    this._midpoints = []
    this._ghost = null
    this._unsubscribe = null
    this._lineDrag = null
    this._holds = 0
    this._suppressClickUntil = 0
  }

  get builder(): RouteBuilder {
    return this._builder
  }

  getEvents(): Record<string, any> {
    return { click: this._onMapClick, zoomend: this._redraw }
  }

  onAdd(map: any): void {
    const { color, casingColor, weight } = this.options as Required<RouteEditorOptions>
    const round = { lineCap: 'round', lineJoin: 'round' }
    this._casing = new Polyline([], { ...round, color: casingColor, weight: weight + 3, opacity: 0.35, interactive: false }).addTo(map)
    this._line = new Polyline([], { ...round, color, weight, opacity: 1, interactive: false }).addTo(map)
    this._preview = new Polyline([], { ...round, color, weight: 3, opacity: 0.9, dashArray: '2 8', interactive: false }).addTo(map)
    // Invisible and wide: a 5px line is too thin to grab.
    this._hit = new Polyline([], { ...round, color, weight: 22, opacity: 0, className: 'tsmap-route-hit' }).addTo(map)
    this._hit.on('pointerdown', this._onLineDown, this)
    this._unsubscribe = this._builder.onChange(() => this._redraw())
    this._redraw()
  }

  onRemove(map: any): void {
    this._endLineDrag(false)
    this._unsubscribe?.()
    this._unsubscribe = null
    this._hit.off('pointerdown', this._onLineDown, this)
    for (const layer of [this._casing, this._line, this._preview, this._hit, ...this._handles, ...this._midpoints])
      map.removeLayer(layer)
    this._handles = []
    this._midpoints = []
  }

  _redraw(): void {
    if (!this._map)
      return
    const path = this._builder.path.map(p => [p.lat, p.lng])
    this._casing.setLatLngs(path)
    this._line.setLatLngs(path)
    this._hit.setLatLngs(path)
    // Leave the handles alone mid-drag — the one under the finger is being
    // moved — and until a drop has routed, so it does not jump back first.
    if (!this._holds) {
      this._syncHandles()
      this._syncMidpoints()
    }
  }

  /** One handle per distinct point: a loop's shared start and end, an out-and-back's turns. */
  _syncHandles(): void {
    const waypoints = this._builder.waypoints
    const wanted: HandleData[] = []
    waypoints.forEach((point, i) => {
      if (waypoints.slice(0, i).some(w => samePoint(w, point)))
        return
      const kind: Kind = i === 0 ? 'start' : i === waypoints.length - 1 ? 'end' : 'via'
      wanted.push({ kind, point })
    })
    this._handles = this._syncMarkers(this._handles, wanted)
  }

  _syncMidpoints(): void {
    const opts = this.options as Required<RouteEditorOptions>
    const wanted: HandleData[] = []
    if (opts.midpoints) {
      const waypoints = this._builder.waypoints
      const seen = new Set<string>()
      this._builder.segments.forEach((segment, i) => {
        const from = waypoints[i]
        const to = waypoints[i + 1]
        // An out-and-back's way home is its way out: one handle for both.
        const key = [from, to].map(p => `${p.lat},${p.lng}`).sort().join('|')
        if (seen.has(key) || this._pixelLength(segment) < opts.midpointMinPixels)
          return
        seen.add(key)
        wanted.push({ kind: 'midpoint', point: halfway(segment), leg: [from, to] })
      })
    }
    this._midpoints = this._syncMarkers(this._midpoints, wanted)
  }

  /** Reuse markers where they can be — recreating one under a pointer would drop the pointer. */
  _syncMarkers(markers: Marker[], wanted: HandleData[]): Marker[] {
    const kept = markers.slice(0, wanted.length)
    for (const extra of markers.slice(wanted.length))
      this._map.removeLayer(extra)
    wanted.forEach((data, i) => {
      const marker = kept[i]
      if (!marker) {
        kept.push(this._createHandle(data))
        return
      }
      const old = (marker as any)._route as HandleData
      if (old.kind !== data.kind) {
        // The last point stops being the end when another is added after it.
        // setIcon() reuses the element, title and all, so set it here too.
        const title = this._title(data.kind)
        marker.options!.title = marker.options!.alt = title
        marker.setIcon(this._icon(data.kind))
        marker.getElement()?.setAttribute('title', title)
      }
      Object.assign(marker, { _route: data })
      marker.setLatLng([data.point.lat, data.point.lng])
    })
    return kept
  }

  _icon(kind: Kind): DivIcon {
    const color = (this.options as RouteEditorOptions).color
    return new DivIcon({
      className: `tsmap-route-handle tsmap-route-${kind}`,
      html: `<span class="tsmap-route-dot" style="--tsmap-route-color:${color}"></span>`,
      iconSize: [HANDLE_SIZE, HANDLE_SIZE],
    })
  }

  _title(kind: Kind): string {
    if (kind === 'midpoint')
      return 'Drag to route through a new point'
    const remove = (this.options as RouteEditorOptions).removeOnTap ? ', tap to remove' : ''
    const name = kind === 'start' ? 'Start' : kind === 'end' ? 'End' : 'Waypoint'
    return `${name} — drag to move${remove}`
  }

  _createHandle(data: HandleData): Marker {
    const marker = new Marker([data.point.lat, data.point.lng], {
      icon: this._icon(data.kind),
      draggable: true,
      autoPan: true,
      title: this._title(data.kind),
      alt: this._title(data.kind),
      // Waypoints above the halfway handles, which are only ever a hint.
      zIndexOffset: data.kind === 'midpoint' ? -100 : 100,
    })
    Object.assign(marker, { _route: data })
    marker.on('dragstart', () => {
      this._holds++
      this.fire('dragstart')
    })
    marker.on('drag', (e: any) => this._showPreview(marker, e.latlng))
    marker.on('dragend', () => {
      this._preview.setLatLngs([])
      const route = (marker as any)._route as HandleData
      const to = plain(marker.getLatLng())
      const done = route.kind === 'midpoint'
        ? this._apply('insert', builder => this._insertInto(builder, route.leg!, to))
        : this._apply('move', builder => this._at(builder, route.point, i => builder.move(i, to)))
      void this._release(done)
    })
    marker.on('click', () => {
      const route = (marker as any)._route as HandleData
      if (route.kind === 'midpoint' || !(this.options as RouteEditorOptions).removeOnTap)
        return
      void this._apply('remove', builder => this._at(builder, route.point, i => builder.remove(i)))
    })
    return marker.addTo(this._map)
  }

  /** Dashed lines from the neighbours to where the point is being dragged. */
  _showPreview(marker: Marker, latlng: LatLngLike): void {
    const route = (marker as any)._route as HandleData
    const at = [latlng.lat, latlng.lng]
    if (route.kind === 'midpoint' || route.kind === 'ghost') {
      const [from, to] = route.leg!
      this._preview.setLatLngs([[from.lat, from.lng], at, [to.lat, to.lng]])
      return
    }
    const waypoints = this._builder.waypoints
    const lines: number[][][] = []
    waypoints.forEach((w, i) => {
      if (!samePoint(w, route.point))
        return
      for (const n of [waypoints[i - 1], waypoints[i + 1]]) {
        if (n && !samePoint(n, route.point))
          lines.push([[n.lat, n.lng], at])
      }
    })
    this._preview.setLatLngs(lines)
  }

  /** Run a change once earlier ones have landed, so the points it names are where it expects. */
  async _apply(action: RouteEditAction, change: (builder: RouteBuilder) => Promise<void> | void): Promise<void> {
    await this._builder.settled()
    await change(this._builder)
    this.fire('edit', { action })
  }

  /** Let the handles follow the builder again once `change` has landed. */
  async _release(change: Promise<void>): Promise<void> {
    try {
      await change
    }
    finally {
      this._holds--
      this._redraw()
    }
  }

  _at(builder: RouteBuilder, point: LatLngLike, run: (index: number) => Promise<void>): Promise<void> | void {
    const index = builder.waypoints.findIndex(w => samePoint(w, point))
    if (index >= 0)
      return run(index)
  }

  _insertInto(builder: RouteBuilder, leg: [LatLngLike, LatLngLike], point: LatLngLike): Promise<void> | void {
    const waypoints = builder.waypoints
    const index = waypoints.findIndex((w, i) => samePoint(w, leg[0]) && waypoints[i + 1] && samePoint(waypoints[i + 1], leg[1]))
    if (index >= 0)
      return builder.insert(index + 1, point)
  }

  _pixelLength(points: LatLngLike[]): number {
    let length = 0
    let last: any = null
    for (const p of points) {
      const pt = this._map.latLngToLayerPoint([p.lat, p.lng])
      if (last)
        length += pt.distanceTo(last)
      last = pt
    }
    return length
  }

  _onMapClick(e: any): void {
    if (!(this.options as RouteEditorOptions).addOnClick || !e?.latlng)
      return
    // The click a line drag ends with is not a tap.
    if (Date.now() < this._suppressClickUntil)
      return
    void this._apply('add', builder => builder.add(plain(e.latlng)))
  }

  // ── Pulling the line ─────────────────────────────────────────────────────

  _onLineDown(e: any): void {
    const event = e.originalEvent as PointerEvent
    if (!(this.options as RouteEditorOptions).dragLine || this._lineDrag || event.shiftKey)
      return
    if (event.pointerType === 'mouse' && event.button !== 0)
      return
    const index = this._builder.nearestSegment(e.latlng)
    if (index < 0)
      return
    const waypoints = this._builder.waypoints
    // The map's own drag listens on the same container, after the layer
    // events: stopping here keeps the map still while the line is pulled.
    event.stopImmediatePropagation()
    this._lineDrag = {
      pointerId: event.pointerId,
      leg: [waypoints[index], waypoints[index + 1]],
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    DomEvent.on(document as any, 'pointermove', this._onLineMove, this)
    DomEvent.on(document as any, 'pointerup', this._onLineUp, this)
    DomEvent.on(document as any, 'pointercancel', this._onLineCancel, this)
  }

  _onLineMove(event: PointerEvent): void {
    const drag = this._lineDrag
    if (!drag || event.pointerId !== drag.pointerId)
      return
    // A second finger is a pinch, not a pull.
    if (PointerEvents.getPointers().length > 1) {
      this._endLineDrag(false)
      return
    }
    if (!drag.moved && Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) < LINE_DRAG_TOLERANCE)
      return
    if (event.cancelable)
      event.preventDefault()
    const latlng = plain(this._map.pointerEventToLatLng(event))
    drag.latlng = latlng
    if (!drag.moved) {
      drag.moved = true
      this._holds++
      this._ghost = this._createGhost(drag.leg, latlng)
      this.fire('dragstart')
    }
    this._ghost!.setLatLng([latlng.lat, latlng.lng])
    this._showPreview(this._ghost!, latlng)
  }

  _onLineUp(event: PointerEvent): void {
    if (this._lineDrag && event.pointerId === this._lineDrag.pointerId)
      this._endLineDrag(true)
  }

  _onLineCancel(event: PointerEvent): void {
    if (this._lineDrag && event.pointerId === this._lineDrag.pointerId)
      this._endLineDrag(false)
  }

  _createGhost(leg: [LatLngLike, LatLngLike], latlng: LatLngLike): Marker {
    const marker = new Marker([latlng.lat, latlng.lng], {
      icon: this._icon('ghost'),
      interactive: false,
      keyboard: false,
      zIndexOffset: 200,
    })
    Object.assign(marker, { _route: { kind: 'ghost', point: latlng, leg } satisfies HandleData })
    return marker.addTo(this._map)
  }

  _endLineDrag(commit: boolean): void {
    const drag = this._lineDrag
    if (!drag)
      return
    this._lineDrag = null
    DomEvent.off(document as any, 'pointermove', this._onLineMove, this)
    DomEvent.off(document as any, 'pointerup', this._onLineUp, this)
    DomEvent.off(document as any, 'pointercancel', this._onLineCancel, this)
    if (this._ghost) {
      this._map?.removeLayer(this._ghost)
      this._ghost = null
    }
    this._preview?.setLatLngs([])
    if (!drag.moved)
      return
    this._suppressClickUntil = Date.now() + 400
    const to = drag.latlng
    void this._release(commit && to
      ? this._apply('insert', builder => this._insertInto(builder, drag.leg, to))
      : Promise.resolve())
  }
}

RouteEditor.setDefaultOptions({
  color: '#10b981',
  casingColor: '#0b1b15',
  weight: 5,
  addOnClick: true,
  removeOnTap: true,
  midpoints: true,
  midpointMinPixels: 72,
  dragLine: true,
})

export function routeEditor(builder: RouteBuilder, options?: RouteEditorOptions): RouteEditor {
  return new RouteEditor(builder, options)
}
