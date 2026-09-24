import type { DirectionsProvider, LatLngLike, Route, TransportProfile } from '../services/types'
import type { DistanceUnits } from '../services/instructions'
import type { Instruction, NavigationProgress, PositionFix } from '../services/navigator'
import type { RouteSimulatorOptions } from '../services/simulator'
import { Evented } from '../core/Events'
import { Point } from '../geometry/Point'
import { LatLngBounds } from '../geo/LatLngBounds'
import { DivIcon } from '../layer/marker/DivIcon'
import { Marker } from '../layer/marker/Marker'
import { Polyline } from '../layer/vector/Polyline'
// Routes are vector paths; this installs the renderer lookup they need, so the
// module works without the rest of the library having been imported first.
import '../layer/vector/Renderer.getRenderer'
import { formatDistance, maneuverIcon, parseManeuver, prefersImperial } from '../services/instructions'
import { Navigator } from '../services/navigator'
import { RouteSimulator } from '../services/simulator'
import { OSRMDirections } from '../services/providers/OSRM'

/**
 * Turn-by-turn navigation on a map, after Apple Maps.
 *
 *   const nav = new TurnByTurn(map, { units: 'imperial' })
 *   await nav.preview(from, to)   // route options, and a Go button
 *   nav.start()                   // guidance: banner, voice, follow camera
 *
 * Preview draws every route the provider offers — the chosen one in blue, the
 * others in grey, any of them tappable — frames them, and shows a card with
 * the time and distance of each. Go starts guidance:
 *
 *   - a banner up top with the next maneuver's arrow, distance and road, and
 *     a "Then" row when a second maneuver follows closely;
 *   - a card below with arrival time, time and distance left, and End;
 *   - a camera that follows from behind and above, heading-up, closer in at
 *     low speed and pulled back at high speed, moving every frame between
 *     GPS fixes rather than jumping once a second;
 *   - the route ahead in blue and the road behind in grey;
 *   - spoken prompts early, to get ready, and at the turn;
 *   - rerouting after a few seconds off the route, and arrival.
 *
 * Positions come from the Geolocation API, or with `simulate` from a drive
 * along the route — which is how to try it at a desk.
 */

export interface TurnByTurnOptions {
  /** Where routes come from. Default: the public OSRM server. */
  directions?: DirectionsProvider
  profile?: TransportProfile
  /** Default: from the browser's locale — miles in the US, kilometres elsewhere. */
  units?: DistanceUnits
  /** Speak instructions with the browser's speech synthesis. Default true. */
  voice?: boolean
  /** Drive the route instead of following the device's position. */
  simulate?: boolean | RouteSimulatorOptions
  /** Offer alternative routes in preview. Default true. */
  alternatives?: boolean
  /** Shown at the top of the preview card: "Directions to …". */
  destinationName?: string
}

const BLUE = '#0a84ff'
const BLUE_CASING = '#0060df'
const GREY = '#a8b3c4'
const GREY_CASING = '#7d8aa0'
const TRAVELED = '#b6bcc6'
const TRAVELED_CASING = '#8e96a3'

export class TurnByTurn extends Evented {
  map: any
  options: Required<Omit<TurnByTurnOptions, 'simulate' | 'destinationName'>> & Pick<TurnByTurnOptions, 'simulate' | 'destinationName'>
  routes: Route[] = []
  selected = 0
  navigator: Navigator | null = null
  from: LatLngLike | null = null
  to: LatLngLike | null = null
  state: 'idle' | 'preview' | 'navigating' | 'arrived' = 'idle'

  _lines: Polyline[] = []
  _traveled: Polyline[] = []
  _puck: Marker | null = null
  _pin: Marker | null = null
  _banner: HTMLElement | null = null
  _card: HTMLElement | null = null
  _recenter: HTMLElement | null = null
  _simulator: RouteSimulator | null = null
  _watch: number | null = null
  _frame: number | null = null
  _following = false
  _fix: { progress: NavigationProgress, time: number } | null = null
  _camera = { bearing: 0, zoom: 17, lastFrame: 0 }
  _rerouting = false
  _muted = false
  _interrupt = (): void => this._pauseFollow()

  constructor(map: any, options: TurnByTurnOptions = {}) {
    super()
    this.map = map
    this.options = {
      directions: options.directions ?? new OSRMDirections(),
      profile: options.profile ?? 'driving',
      units: options.units ?? (prefersImperial() ? 'imperial' : 'metric'),
      voice: options.voice ?? true,
      alternatives: options.alternatives ?? true,
      simulate: options.simulate,
      destinationName: options.destinationName,
    }
  }

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  /** Fetch routes between two places, draw them, and show the route card. */
  async preview(from: LatLngLike, to: LatLngLike): Promise<Route[]> {
    this.stop()
    this.from = from
    this.to = to
    const routes = await this.options.directions.getDirections([from, to], {
      profile: this.options.profile,
      alternatives: this.options.alternatives,
    })
    if (!routes.length)
      throw new Error('No route found')
    this.routes = routes
    this.selected = 0
    this.state = 'preview'
    this._drawRoutes()
    this._placePin(to)
    this._showPreviewCard()

    // Frame every option, clear of the card at the bottom.
    const bounds = new LatLngBounds(routes.flatMap(r => r.geometry.map(p => [p.lat, p.lng] as [number, number])))
    this.map.setBearing?.(0)
    this.map.setPitch?.(0)
    this.map.fitBounds(bounds, { paddingTopLeft: [40, 40], paddingBottomRight: [40, 200], animate: true })
    this.fire('preview', { routes })
    return routes
  }

  /** Choose which of the previewed routes to take. */
  selectRoute(index: number): void {
    if (index < 0 || index >= this.routes.length || index === this.selected)
      return
    this.selected = index
    this._drawRoutes()
    if (this.state === 'preview')
      this._showPreviewCard()
    this.fire('routeselect', { index, route: this.routes[index] })
  }

  get route(): Route | undefined {
    return this.routes[this.selected]
  }

  get progress(): NavigationProgress | null {
    return this.navigator?.progress ?? null
  }

  // ---------------------------------------------------------------------------
  // Guidance
  // ---------------------------------------------------------------------------

  /** Start guidance along the selected route. */
  start(): void {
    const route = this.route
    if (!route)
      throw new Error('Preview a route first')

    const nav = this.navigator = new Navigator(route, { profile: this.options.profile, units: this.options.units })
    nav.on('progress', (e: any) => this._onProgress(e.progress))
    nav.on('instruction', (e: any) => this._onInstruction(e.instruction))
    nav.on('offroute', (e: any) => this._reroute(e.progress))
    nav.on('arrive', (e: any) => this._onArrive(e.progress))
    this.state = 'navigating'

    // Only the chosen route stays on the map once you set off.
    this.routes = [route]
    this.selected = 0
    this._drawRoutes()

    // The camera eases in from wherever the overview left it, rather than
    // cutting to the driver's seat.
    this._camera = { bearing: this.map._bearing ?? 0, zoom: this.map.getZoom(), lastFrame: 0 }
    this._card?.remove()
    this._card = null
    this._showBanner()
    this._showTripCard()
    this._showPuck(route.geometry[0] ?? this.from!)

    this._speak(this.route?.steps[0]?.name ? `Starting route on ${this.route.steps[0].name}` : 'Starting route')
    this._startPositions()
    this._following = true
    this.map.on('dragstart', this._interrupt)
    this.map.getContainer().addEventListener('wheel', this._interrupt, { passive: true })
    this._startFollowLoop()
    this.fire('start', { route })
  }

  /** End navigation, or clear a preview, and put the map back. */
  stop(): void {
    const wasNavigating = this.state === 'navigating' || this.state === 'arrived'
    this._stopPositions()
    if (this._frame !== null)
      cancelAnimationFrame(this._frame)
    this._frame = null
    this.map.off?.('dragstart', this._interrupt)
    this.map.getContainer?.()?.removeEventListener?.('wheel', this._interrupt)
    for (const layer of [...this._lines, ...this._traveled])
      layer.remove()
    this._lines = []
    this._traveled = []
    this._puck?.remove()
    this._pin?.remove()
    this._puck = null
    this._pin = null
    for (const el of [this._banner, this._card, this._recenter])
      el?.remove()
    this._banner = this._card = this._recenter = null
    if (typeof speechSynthesis !== 'undefined')
      speechSynthesis.cancel()
    this.navigator = null
    this._fix = null
    this._following = false
    this.state = 'idle'
    if (wasNavigating) {
      this.map.easeTo?.({ bearing: 0, pitch: 0, duration: 600 })
      this.fire('end')
    }
  }

  /** Feed a position yourself — from your own location source, or a recorded trace. */
  update(fix: PositionFix): NavigationProgress | null {
    return this.navigator?.update(fix) ?? null
  }

  _startPositions(): void {
    const simulate = this.options.simulate
    if (simulate) {
      this._simulator = new RouteSimulator(this.navigator!, fix => this.update(fix), typeof simulate === 'object' ? simulate : {})
      this._simulator.start()
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation)
      return
    this._watch = navigator.geolocation.watchPosition(
      p => this.update({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        heading: p.coords.heading,
        speed: p.coords.speed,
        accuracy: p.coords.accuracy,
        time: p.timestamp,
      }),
      error => this.fire('error', { error }),
      { enableHighAccuracy: true, maximumAge: 1000 },
    )
  }

  _stopPositions(): void {
    this._simulator?.stop()
    this._simulator = null
    if (this._watch !== null && typeof navigator !== 'undefined')
      navigator.geolocation?.clearWatch(this._watch)
    this._watch = null
  }

  _onProgress(progress: NavigationProgress): void {
    this._fix = { progress, time: performance.now() }
    // The follow camera never stops, so nothing else would tell the map it
    // has settled: once a fix, let tiles load and prune and overlays redraw.
    if (this._following)
      this.map.fire('moveend')
    this._updateBanner(progress)
    this._updateTripCard(progress)
    this._updateTraveled(progress.distanceTraveled)
    this.fire('progress', { progress })
  }

  _onInstruction(instruction: Instruction): void {
    this._speak(instruction.spoken)
    this.fire('instruction', { instruction })
  }

  async _reroute(progress: NavigationProgress): Promise<void> {
    if (this._rerouting || !this.to)
      return
    this._rerouting = true
    this._speak('Rerouting')
    this.fire('reroute', { progress })
    try {
      const [route] = await this.options.directions.getDirections([progress.raw, this.to], { profile: this.options.profile })
      if (route && this.navigator) {
        this.routes = [route]
        this.selected = 0
        this.navigator.setRoute(route)
        this._drawRoutes()
      }
    }
    catch (error) {
      this.fire('error', { error })
    }
    finally {
      this._rerouting = false
    }
  }

  _onArrive(progress: NavigationProgress): void {
    this.state = 'arrived'
    this._stopPositions()
    this._speak('You have arrived')
    if (this._banner) {
      this._banner.innerHTML = `<div class="tsmap-nav-icon">${maneuverIcon(parseManeuver('arrive'))}</div><div class="tsmap-nav-banner-text"><div class="tsmap-nav-distance">Arrived</div><div class="tsmap-nav-road">${escape(this.options.destinationName ?? 'Your destination')}</div></div>`
    }
    this.fire('arrive', { progress })
  }

  _speak(text: string): void {
    if (!this.options.voice || this._muted || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined')
      return
    speechSynthesis.cancel()
    speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------

  /**
   * Follow from behind and above, every frame.
   *
   * GPS arrives once a second. Moving the camera only then makes the map
   * lurch forward in steps; Apple Maps glides. Between fixes the position is
   * carried forward along the route at the last known speed — along the
   * route, not in a straight line, so it bends with the road — and the
   * camera eases after it.
   */
  _startFollowLoop(): void {
    const frame = (time: number): void => {
      this._frame = requestAnimationFrame(frame)
      const fix = this._fix
      const nav = this.navigator
      if (!fix || !nav)
        return
      const dt = this._camera.lastFrame ? Math.min(0.1, (time - this._camera.lastFrame) / 1000) : 0
      this._camera.lastFrame = time

      // Dead reckoning along the route, at most a couple of seconds ahead.
      const ahead = this.state === 'navigating' ? Math.min(2, (performance.now() - fix.time) / 1000) * fix.progress.speed : 0
      const { location, heading } = nav.pointAt(fix.progress.distanceTraveled + ahead)
      this._puck?.setLatLng([location.lat, location.lng])

      if (this._following)
        this._placeCamera(location, heading, fix.progress.speed, dt)
      this._rotatePuck(heading)
    }
    this._frame = requestAnimationFrame(frame)
  }

  _placeCamera(location: LatLngLike, heading: number, speed: number, dt: number): void {
    const map = this.map
    const walking = this.options.profile === 'walking'
    // Closer in when slow, further out on a fast road, as Apple Maps does.
    const zoomTarget = walking ? 18 : 17.4 - Math.min(1.6, Math.max(0, (speed - 8) / 12))
    const pitchTarget = walking ? 45 : 58
    const ease = (tau: number): number => (dt > 0 ? 1 - Math.exp(-dt / tau) : 1)

    // Heading-up: the bearing is the direction at the top of the screen.
    const target = heading
    const delta = ((target - this._camera.bearing + 540) % 360) - 180
    this._camera.bearing = (this._camera.bearing + delta * ease(0.45) + 360) % 360
    this._camera.zoom += (zoomTarget - this._camera.zoom) * ease(1.2)

    map._bearing = this._camera.bearing
    map._pitch = map._pitch + (pitchTarget - map._pitch) * ease(0.6)
    map._applyCameraTransform()

    // The traveller sits low on the screen, with the road ahead above.
    const size = map.getSize()
    const offset: Point = map._groundOffset(new Point(size.x / 2, size.y * 0.72))
    const zoom = this._camera.zoom
    const center = map.unproject(map.project([location.lat, location.lng], zoom).subtract(offset), zoom)
    map._move(center, zoom, { relayout: true })
    map.fire('rotate', { bearing: map._bearing })
  }

  _pauseFollow(): void {
    if (!this._following || this.state !== 'navigating')
      return
    this._following = false
    this._showRecenter()
  }

  recenter(): void {
    this._following = true
    this._camera.bearing = this.map._bearing ?? 0
    this._camera.zoom = this.map.getZoom()
    this._recenter?.remove()
    this._recenter = null
  }

  // ---------------------------------------------------------------------------
  // Map layers
  // ---------------------------------------------------------------------------

  _drawRoutes(): void {
    for (const layer of [...this._lines, ...this._traveled])
      layer.remove()
    this._lines = []
    this._traveled = []

    // Alternatives first so the chosen route is drawn on top of them.
    const order = this.routes.map((_, i) => i).sort((a, b) => Number(a === this.selected) - Number(b === this.selected))
    for (const i of order) {
      const route = this.routes[i]!
      const chosen = i === this.selected
      const latlngs = route.geometry.map(p => [p.lat, p.lng] as [number, number])
      const casing = new Polyline(latlngs, { color: chosen ? BLUE_CASING : GREY_CASING, weight: 12, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: !chosen })
      const fill = new Polyline(latlngs, { color: chosen ? BLUE : GREY, weight: 8, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: !chosen })
      for (const line of [casing, fill]) {
        line.addTo(this.map)
        if (!chosen)
          line.on('click', () => this.selectRoute(i))
      }
      this._lines.push(casing, fill)
    }

    // The stretch already driven, greyed out over the route.
    if (this.state === 'navigating' || this.navigator) {
      const casing = new Polyline([], { color: TRAVELED_CASING, weight: 12, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.map)
      const fill = new Polyline([], { color: TRAVELED, weight: 8, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.map)
      this._traveled = [casing, fill]
    }
  }

  _updateTraveled(distance: number): void {
    const nav = this.navigator
    if (!nav || !this._traveled.length)
      return
    const latlngs: Array<[number, number]> = []
    for (let i = 0; i < nav.points.length && nav.along[i]! < distance; i++)
      latlngs.push([nav.points[i]!.lat, nav.points[i]!.lng])
    const here = nav.pointAt(distance).location
    latlngs.push([here.lat, here.lng])
    for (const line of this._traveled)
      line.setLatLngs(latlngs)
  }

  _placePin(to: LatLngLike): void {
    this._pin?.remove()
    this._pin = new Marker([to.lat, to.lng], {
      icon: new DivIcon({ className: '', html: '<div class="tsmap-nav-pin"></div>', iconSize: [30, 38], iconAnchor: [15, 36] }),
      interactive: false,
    }).addTo(this.map)
  }

  _showPuck(at: LatLngLike): void {
    this._puck?.remove()
    this._puck = new Marker([at.lat, at.lng], {
      icon: new DivIcon({ className: '', html: '<div class="tsmap-nav-puck"><div class="tsmap-nav-puck-arrow"></div></div>', iconSize: [36, 36], iconAnchor: [18, 18] }),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(this.map)
  }

  _rotatePuck(heading: number): void {
    const icon = (this._puck as any)?._icon as HTMLElement | undefined
    const arrow = icon?.querySelector?.('.tsmap-nav-puck-arrow') as HTMLElement | null
    if (arrow)
      arrow.style.transform = `rotate(${heading - (this.map._bearing ?? 0)}deg)`
  }

  // ---------------------------------------------------------------------------
  // Panels
  // ---------------------------------------------------------------------------

  _panel(className: string): HTMLElement {
    const el = document.createElement('div')
    el.className = className
    // Taps on a panel are for the panel, not a drag of the map beneath it.
    for (const type of ['pointerdown', 'wheel', 'dblclick', 'click'])
      el.addEventListener(type, e => e.stopPropagation())
    this.map.getContainer().appendChild(el)
    return el
  }

  _showPreviewCard(): void {
    this._card?.remove()
    const card = this._card = this._panel('tsmap-nav-card tsmap-nav-preview')
    const title = this.options.destinationName ? `Directions to ${escape(this.options.destinationName)}` : 'Directions'
    const rows = this.routes.map((route, i) => `
      <button class="tsmap-nav-option${i === this.selected ? ' tsmap-selected' : ''}" data-index="${i}">
        <span class="tsmap-nav-option-time">${formatDuration(route.duration)}</span>
        <span class="tsmap-nav-option-detail">${formatDistance(route.distance, this.options.units)}${i === 0 ? ' · Fastest' : ''}</span>
      </button>`).join('')
    card.innerHTML = `
      <div class="tsmap-nav-card-head"><span class="tsmap-nav-card-title">${title}</span><button class="tsmap-nav-close" aria-label="Close">✕</button></div>
      <div class="tsmap-nav-options">${rows}</div>
      <button class="tsmap-nav-go">Go</button>`
    card.querySelectorAll<HTMLElement>('.tsmap-nav-option').forEach(el => el.addEventListener('click', () => this.selectRoute(Number(el.dataset.index))))
    card.querySelector('.tsmap-nav-go')?.addEventListener('click', () => this.start())
    card.querySelector('.tsmap-nav-close')?.addEventListener('click', () => this.stop())
  }

  _showBanner(): void {
    this._banner?.remove()
    this._banner = this._panel('tsmap-nav-banner')
    const first = this.route?.steps[1]
    const maneuver = parseManeuver(first?.maneuver ?? 'depart', first?.exit)
    this._banner.innerHTML = `<div class="tsmap-nav-icon">${maneuverIcon(maneuver)}</div><div class="tsmap-nav-banner-text"><div class="tsmap-nav-distance"></div><div class="tsmap-nav-road"></div></div>`
  }

  _updateBanner(p: NavigationProgress): void {
    const banner = this._banner
    if (!banner || this.state !== 'navigating')
      return
    const icon = maneuverIcon(p.nextManeuver)
    const name = p.nextStep?.name
    const road = name ? abbreviated(p.banner, name) : p.banner
    const then = p.thenManeuver ? `<div class="tsmap-nav-then">Then <span class="tsmap-nav-then-icon">${maneuverIcon(p.thenManeuver)}</span></div>` : ''
    const html = `<div class="tsmap-nav-icon">${icon}</div><div class="tsmap-nav-banner-text"><div class="tsmap-nav-distance">${formatDistance(p.distanceToManeuver, this.options.units)}</div><div class="tsmap-nav-road">${escape(road)}</div></div>${then}`
    if (banner.innerHTML !== html)
      banner.innerHTML = html
  }

  _showTripCard(): void {
    this._card?.remove()
    const card = this._card = this._panel('tsmap-nav-card tsmap-nav-trip')
    card.innerHTML = `
      <div class="tsmap-nav-trip-stats">
        <div><div class="tsmap-nav-arrival tsmap-nav-stat">--:--</div><div class="tsmap-nav-stat-label">arrival</div></div>
        <div><div class="tsmap-nav-minutes tsmap-nav-stat">--</div><div class="tsmap-nav-stat-label">min</div></div>
        <div><div class="tsmap-nav-left tsmap-nav-stat">--</div><div class="tsmap-nav-left-unit tsmap-nav-stat-label"></div></div>
      </div>
      <button class="tsmap-nav-mute" aria-label="Mute">🔊</button>
      <button class="tsmap-nav-end">End</button>`
    card.querySelector('.tsmap-nav-end')?.addEventListener('click', () => this.stop())
    card.querySelector('.tsmap-nav-mute')?.addEventListener('click', (e) => {
      this._muted = !this._muted
      const button = e.currentTarget as HTMLElement
      button.textContent = this._muted ? '🔇' : '🔊'
      if (this._muted && typeof speechSynthesis !== 'undefined')
        speechSynthesis.cancel()
    })
  }

  _updateTripCard(p: NavigationProgress): void {
    const card = this._card
    if (!card)
      return
    const [value, unit] = formatDistance(p.distanceRemaining, this.options.units).split(' ')
    const set = (selector: string, text: string): void => {
      const el = card.querySelector(selector)
      if (el && el.textContent !== text)
        el.textContent = text
    }
    set('.tsmap-nav-arrival', p.arrival.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
    set('.tsmap-nav-minutes', String(Math.max(1, Math.round(p.durationRemaining / 60))))
    set('.tsmap-nav-left', value ?? '')
    set('.tsmap-nav-left-unit', unit ?? '')
  }

  _showRecenter(): void {
    if (this._recenter)
      return
    const button = this._recenter = this._panel('tsmap-nav-recenter')
    button.textContent = 'Resume'
    button.addEventListener('click', () => this.recenter())
  }
}

export function turnByTurn(map: any, options?: TurnByTurnOptions): TurnByTurn {
  return new TurnByTurn(map, options)
}

/** "12 min", "1 hr 5 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60)
    return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

/** The banner's road, with the name part of the instruction dropped: Apple shows just the road under the distance. */
function abbreviated(banner: string, name: string): string {
  const onto = banner.lastIndexOf(' onto ')
  return onto >= 0 ? banner.slice(onto + 6) : banner || name
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
}
