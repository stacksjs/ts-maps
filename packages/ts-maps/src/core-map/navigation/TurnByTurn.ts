import type { DirectionsProvider, LatLngLike, Route, TransitDetails, TravelMode } from '../services/types'
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
import { controlLocale, formatDate, languageOf, message, translator } from '../i18n'
import { formatDistance, laneIcon, maneuverIcon, parseManeuver, prefersImperial } from '../services/instructions'
import { Navigator } from '../services/navigator'
import { RouteSimulator } from '../services/simulator'
import { transitRides } from '../services/transit'
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
  /** `'transit'` needs a provider that plans it: OpenTripPlanner, or Google. */
  profile?: TravelMode
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
  /** The language of the cards, the banner and the voice. Default the map's, else the browser's. */
  locale?: string
}

/**
 * Every event a `TurnByTurn` fires, with the callback-prop name the framework
 * bindings give it. One table, so React, Solid, Svelte and the rest cannot
 * drift apart on what the events are called.
 */
export const TURN_BY_TURN_EVENTS: {
  readonly preview: 'onPreview'
  readonly routeselect: 'onRouteSelect'
  readonly start: 'onStart'
  readonly progress: 'onProgress'
  readonly instruction: 'onInstruction'
  readonly reroute: 'onReroute'
  readonly arrive: 'onArrive'
  readonly end: 'onEnd'
  readonly error: 'onError'
} = {
  preview: 'onPreview',
  routeselect: 'onRouteSelect',
  start: 'onStart',
  progress: 'onProgress',
  instruction: 'onInstruction',
  reroute: 'onReroute',
  arrive: 'onArrive',
  end: 'onEnd',
  error: 'onError',
}

export type TurnByTurnEvent = keyof typeof TURN_BY_TURN_EVENTS

/** A place, as `{ lat, lng }` or `[lat, lng]` — the order `center` takes. */
export type LatLngInput = LatLngLike | [number, number]

/**
 * What `sync` brings the navigation into line with: the trip, and the
 * options, which are followed when their key is present, undefined meaning
 * the default. A binding passes every prop; code of your own passes what it
 * changes.
 */
export interface TurnByTurnTarget extends TurnByTurnOptions {
  from?: LatLngInput | null
  to?: LatLngInput | null
  /** Guide along the route rather than just preview it. */
  active?: boolean
}

function sameSimulate(a: TurnByTurnOptions['simulate'], b: TurnByTurnOptions['simulate']): boolean {
  return a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function toLatLng(input: LatLngInput | null | undefined): LatLngLike | null {
  if (!input)
    return null
  if (Array.isArray(input))
    return { lat: input[0], lng: input[1] }
  return { lat: input.lat, lng: input.lng }
}

function samePlace(a: LatLngLike | null, b: LatLngLike | null): boolean {
  return a === b || (!!a && !!b && a.lat === b.lat && a.lng === b.lng)
}

/**
 * How traffic changes a route, as Apple says it: "4 min delay" in orange or
 * red as it grows, or that the traffic is light. Nothing where the provider
 * does not count traffic.
 */
export function trafficNote(route: Route, locale?: string): string {
  if (!route.traffic || route.typicalDuration === undefined)
    return ''
  const delay = route.duration - route.typicalDuration
  if (delay < 60)
    return `<span class="tsmap-nav-traffic tsmap-nav-traffic-light">${message(locale, 'nav.lightTraffic')}</span>`
  const heavy = delay >= Math.max(600, route.typicalDuration * 0.25)
  return `<span class="tsmap-nav-traffic tsmap-nav-traffic-${heavy ? 'heavy' : 'moderate'}">${message(locale, 'nav.delay', { duration: formatDuration(delay, locale) })}</span>`
}

/** A line as its sign shows it: its name on its colour. */
export function lineBadge(ride: TransitDetails): string {
  const style = ride.color ? ` style="background:${escape(ride.color)};color:${escape(ride.textColor ?? '#fff')}"` : ''
  return `<span class="tsmap-nav-line tsmap-nav-line-${ride.vehicle}"${style}>${escape(ride.line)}</span>`
}

/** A transit route in a line: its rides, and when it leaves and arrives. "N › 38 · 10:12–10:41". */
export function transitSummary(route: Route, locale?: string): string {
  const rides = transitRides(route)
  const time = (d: Date): string => formatDate(d, locale, { hour: 'numeric', minute: '2-digit' })
  const leaves = route.departure ?? rides[0]?.departure
  const arrives = route.arrival ?? rides[rides.length - 1]?.arrival
  const when = leaves && arrives ? ` · ${time(leaves)}–${time(arrives)}` : ''
  return `${rides.map(lineBadge).join('<span class="tsmap-nav-line-sep">›</span>')}${when}`
}

const BLUE = '#0a84ff'
const BLUE_CASING = '#0060df'
const GREY = '#a8b3c4'
const GREY_CASING = '#7d8aa0'
const TRAVELED = '#b6bcc6'
const TRAVELED_CASING = '#8e96a3'

export class TurnByTurn extends Evented {
  map: any
  options: Required<Omit<TurnByTurnOptions, 'simulate' | 'destinationName' | 'locale'>> & Pick<TurnByTurnOptions, 'simulate' | 'destinationName' | 'locale'>
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
  _target: { from: LatLngLike | null, to: LatLngLike | null, active: boolean } = { from: null, to: null, active: false }
  _syncs = 0
  _previews = 0
  _givenDirections: DirectionsProvider | undefined
  _interrupt = (): void => this._pauseFollow()

  constructor(map: any, options: TurnByTurnOptions = {}) {
    super()
    this.map = map
    this._givenDirections = options.directions
    this.options = {
      directions: options.directions ?? new OSRMDirections(),
      profile: options.profile ?? 'driving',
      units: options.units ?? (prefersImperial(options.locale ?? map?.options?.locale) ? 'imperial' : 'metric'),
      voice: options.voice ?? true,
      alternatives: options.alternatives ?? true,
      simulate: options.simulate,
      destinationName: options.destinationName,
      locale: options.locale,
    }
  }

  /** The language it speaks: its own `locale`, else the map's, else the browser's. */
  get locale(): string {
    return controlLocale({ options: this.options, _map: this.map })
  }

  /** What to ask the provider for: a language only where one was chosen, so the provider's own default stands otherwise. */
  _language(): { language?: string } {
    const language = this.options.locale ?? this.map?.options?.locale
    return language ? { language } : {}
  }

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  /** Fetch routes between two places, draw them, and show the route card. */
  async preview(from: LatLngLike, to: LatLngLike): Promise<Route[]> {
    this.stop()
    this.from = from
    this.to = to
    // Routes for a trip that has since been replaced arrive late and are
    // dropped: typing a new destination must not be overwritten by the last.
    const call = ++this._previews
    const routes = await this.options.directions.getDirections([from, to], {
      profile: this.options.profile,
      alternatives: this.options.alternatives,
      ...this._language(),
    })
    if (call !== this._previews)
      return routes
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

    // On transit, what is guided is the walking: the rides keep their own time.
    const nav = this.navigator = new Navigator(route, { profile: this.options.profile === 'transit' ? 'walking' : this.options.profile, units: this.options.units, locale: this.locale })
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

    const t = translator(this.locale)
    const road = this.route?.steps[0]?.name
    this._speak(road ? t('nav.startingOn', { name: road }) : t('nav.starting'))
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

  /**
   * Bring the navigation into line with a declarative description of it —
   * what the framework bindings call as their props change.
   *
   * New endpoints preview the routes between them; clearing either clears the
   * map. `active` starts guidance once a preview is showing, and turning it
   * off ends guidance and goes back to the preview. A call that arrives while
   * an earlier one is still fetching routes wins: the earlier one's routes are
   * dropped rather than shown late.
   */
  async sync(target: TurnByTurnTarget): Promise<void> {
    const reroute = this._syncOptions(target)
    const from = toLatLng(target.from)
    const to = toLatLng(target.to)
    // Another profile or provider is another set of routes: a showing
    // preview is fetched again. During guidance it applies from the next
    // reroute, rather than pulling the route from under the driver.
    const moved = !samePlace(from, this._target.from) || !samePlace(to, this._target.to) || (reroute && this.state === 'preview')
    // `active` is followed when it changes, or the trip does: Go pressed on
    // the card is not undone because some other prop changed meanwhile.
    const toggled = !!target.active !== this._target.active
    this._target = { from, to, active: !!target.active }
    const call = ++this._syncs

    const previewAgain = async (): Promise<boolean> => {
      if (!from || !to) {
        this.stop()
        return false
      }
      try {
        await this.preview(from, to)
      }
      catch (error) {
        if (call === this._syncs)
          this.fire('error', { error })
        return false
      }
      return call === this._syncs
    }

    if (moved && !(await previewAgain()))
      return
    if (!moved && !toggled)
      return

    if (this._target.active && this.state === 'preview') {
      this.start()
    }
    else if (!this._target.active && (this.state === 'navigating' || this.state === 'arrived')) {
      this.stop()
      await previewAgain()
    }
  }

  /**
   * Follow the options present in `target`. Units, voice, the destination's
   * name and simulation take effect at once or at the next start; returns
   * whether the routes themselves would change (profile, provider,
   * alternatives).
   */
  _syncOptions(target: TurnByTurnOptions): boolean {
    const has = (key: keyof TurnByTurnOptions): boolean => key in target
    const o = this.options
    let reroute = false
    // Compared with what the caller passed, not with what is in use: an
    // undefined provider is the default, and should not build a new OSRM
    // client on every call.
    if (has('directions') && target.directions !== this._givenDirections) {
      this._givenDirections = target.directions
      o.directions = target.directions ?? new OSRMDirections()
      reroute = true
    }
    if (has('profile') && (target.profile ?? 'driving') !== o.profile) {
      o.profile = target.profile ?? 'driving'
      reroute = true
    }
    if (has('alternatives') && (target.alternatives ?? true) !== o.alternatives) {
      o.alternatives = target.alternatives ?? true
      reroute = true
    }
    let redraw = false
    if (has('locale') && target.locale !== o.locale) {
      o.locale = target.locale
      if (this.navigator)
        (this.navigator.options as { locale?: string }).locale = this.locale
      redraw = true
    }
    const units = target.units ?? (prefersImperial(o.locale ?? this.map?.options?.locale) ? 'imperial' : 'metric')
    if (has('units') && units !== o.units) {
      o.units = units
      if (this.navigator)
        (this.navigator.options as { units: DistanceUnits }).units = units
      redraw = true
    }
    if (has('destinationName') && target.destinationName !== o.destinationName) {
      o.destinationName = target.destinationName
      redraw = true
    }
    if (has('voice') && (target.voice ?? true) !== o.voice) {
      o.voice = target.voice ?? true
      if (!o.voice && typeof speechSynthesis !== 'undefined')
        speechSynthesis.cancel()
    }
    if (has('simulate') && !sameSimulate(target.simulate, o.simulate))
      o.simulate = target.simulate
    if (redraw && this.state === 'preview')
      this._showPreviewCard()
    else if (redraw && this.state === 'navigating' && this.navigator?.progress) {
      this._showBanner()
      this._showTripCard()
    }
    return reroute
  }

  /**
   * An event reduced to plain data, for a binding that has to send it across
   * a boundary — the React Native WebView bridge — where live objects and
   * dates do not survive.
   */
  static plainEvent(type: TurnByTurnEvent, event: any): Record<string, unknown> {
    const p = event?.progress as NavigationProgress | undefined
    switch (type) {
      case 'progress':
      case 'arrive':
      case 'reroute':
        return p
          ? {
              location: p.location,
              distanceRemaining: p.distanceRemaining,
              durationRemaining: p.durationRemaining,
              arrival: p.arrival.toISOString(),
              distanceToManeuver: p.distanceToManeuver,
              banner: p.banner,
              stepIndex: p.stepIndex,
              offRouteDistance: p.offRouteDistance,
              lanes: p.lanes,
            }
          : {}
      case 'instruction': {
        const i = event?.instruction as Instruction | undefined
        return i ? { text: i.text, spoken: i.spoken, stage: i.stage, distance: i.distance } : {}
      }
      case 'preview':
        return { routes: (event?.routes as Route[] | undefined ?? []).map(r => ({ distance: r.distance, duration: r.duration })) }
      case 'routeselect':
        return { index: event?.index }
      case 'error':
        return { message: String(event?.error?.message ?? event?.error ?? 'error') }
      default:
        return {}
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
    this._speak(message(this.locale, 'nav.rerouting'))
    this.fire('reroute', { progress })
    try {
      const [route] = await this.options.directions.getDirections([progress.raw, this.to], { profile: this.options.profile, ...this._language() })
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
    const t = translator(this.locale)
    this._speak(t('nav.youHaveArrived'))
    if (this._banner) {
      this._banner.innerHTML = `<div class="tsmap-nav-icon">${maneuverIcon(parseManeuver('arrive'))}</div><div class="tsmap-nav-banner-text"><div class="tsmap-nav-distance">${t('nav.arrived')}</div><div class="tsmap-nav-road">${escape(this.options.destinationName ?? t('nav.yourDestination'))}</div></div>`
    }
    this.fire('arrive', { progress })
  }

  _speak(text: string): void {
    if (!this.options.voice || this._muted || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined')
      return
    speechSynthesis.cancel()
    // In the language of the words: a German sentence in an English voice
    // is hard to follow.
    const utterance = new SpeechSynthesisUtterance(text)
    const locale = this.locale
    utterance.lang = locale
    const voice = voiceFor(locale, speechSynthesis.getVoices?.() ?? [])
    if (voice)
      utterance.voice = voice
    speechSynthesis.speak(utterance)
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
    const walking = this.options.profile === 'walking' || this.options.profile === 'transit'
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
    const locale = this.locale
    const t = translator(locale)
    const title = this.options.destinationName ? t('nav.directionsTo', { name: escape(this.options.destinationName) }) : t('nav.directions')
    const rows = this.routes.map((route, i) => `
      <button class="tsmap-nav-option${i === this.selected ? ' tsmap-selected' : ''}" data-index="${i}">
        <span class="tsmap-nav-option-time">${formatDuration(route.duration, locale)}</span>
        <span class="tsmap-nav-option-detail">${transitRides(route).length ? transitSummary(route, locale) : `${formatDistance(route.distance, this.options.units, locale)}${i === 0 ? ` · ${t('nav.fastest')}` : ''}`}</span>
        ${trafficNote(route, locale)}
      </button>`).join('')
    card.innerHTML = `
      <div class="tsmap-nav-card-head"><span class="tsmap-nav-card-title">${title}</span><button class="tsmap-nav-close" aria-label="${t('nav.close')}">✕</button></div>
      <div class="tsmap-nav-options">${rows}</div>
      <button class="tsmap-nav-go" aria-label="${t('nav.startRoute')}">${t('nav.go')}</button>`
    card.querySelectorAll<HTMLElement>('.tsmap-nav-option').forEach(el => el.addEventListener('click', () => this.selectRoute(Number(el.dataset.index))))
    card.querySelector('.tsmap-nav-go')?.addEventListener('click', () => this.start())
    card.querySelector('.tsmap-nav-close')?.addEventListener('click', () => this.stop())
  }

  _showBanner(): void {
    this._banner?.remove()
    this._banner = this._panel('tsmap-nav-banner')
    // The next maneuver, read out as it changes without taking focus; with
    // the voice muted, this is how a screen reader hears the route.
    this._banner.setAttribute('role', 'status')
    this._banner.setAttribute('aria-live', 'polite')
    const first = this.route?.steps[1]
    const maneuver = parseManeuver(first?.maneuver ?? 'depart', first?.exit)
    this._banner.innerHTML = `<div class="tsmap-nav-icon">${maneuverIcon(maneuver)}</div><div class="tsmap-nav-banner-text"><div class="tsmap-nav-distance"></div><div class="tsmap-nav-road"></div></div>`
  }

  _updateBanner(p: NavigationProgress): void {
    const banner = this._banner
    if (!banner || this.state !== 'navigating')
      return
    const locale = this.locale
    const t = translator(locale)
    const icon = maneuverIcon(p.nextManeuver)
    const name = p.nextStep?.name
    const road = name ? abbreviated(p.banner, name, locale) : p.banner
    const then = p.thenManeuver ? `<div class="tsmap-nav-then">${t('nav.then')} <span class="tsmap-nav-then-icon">${maneuverIcon(p.thenManeuver)}</span></div>` : ''
    // Apple's lane strip: every lane approaching the maneuver, the ones to be
    // in bright and the rest dimmed, shown as the maneuver draws near.
    const lanes = p.lanes
      ? `<div class="tsmap-nav-lanes" role="img" aria-label="${t('nav.lanes')}">${p.lanes.map(lane => `<span class="tsmap-nav-lane${lane.valid ? ' tsmap-nav-lane-valid' : ''}">${laneIcon(lane, p.nextManeuver)}</span>`).join('')}</div>`
      : ''
    const html = `<div class="tsmap-nav-icon">${icon}</div><div class="tsmap-nav-banner-text"><div class="tsmap-nav-distance">${formatDistance(p.distanceToManeuver, this.options.units, locale)}</div><div class="tsmap-nav-road">${escape(road)}</div></div>${then}${lanes}`
    if (banner.innerHTML !== html)
      banner.innerHTML = html
  }

  _showTripCard(): void {
    this._card?.remove()
    const card = this._card = this._panel('tsmap-nav-card tsmap-nav-trip')
    const t = translator(this.locale)
    card.innerHTML = `
      <div class="tsmap-nav-trip-stats">
        <div><div class="tsmap-nav-arrival tsmap-nav-stat">--:--</div><div class="tsmap-nav-stat-label">${t('nav.arrival')}</div></div>
        <div><div class="tsmap-nav-minutes tsmap-nav-stat">--</div><div class="tsmap-nav-stat-label">${t('nav.min')}</div></div>
        <div><div class="tsmap-nav-left tsmap-nav-stat">--</div><div class="tsmap-nav-left-unit tsmap-nav-stat-label"></div></div>
      </div>
      <button class="tsmap-nav-mute" aria-label="${t('nav.mute')}" aria-pressed="${this._muted}">${this._muted ? '🔇' : '🔊'}</button>
      <button class="tsmap-nav-end" aria-label="${t('nav.endRoute')}">${t('nav.end')}</button>`
    card.querySelector('.tsmap-nav-end')?.addEventListener('click', () => this.stop())
    card.querySelector('.tsmap-nav-mute')?.addEventListener('click', (e) => {
      this._muted = !this._muted
      const button = e.currentTarget as HTMLElement
      button.textContent = this._muted ? '🔇' : '🔊'
      button.setAttribute('aria-pressed', String(this._muted))
      if (this._muted && typeof speechSynthesis !== 'undefined')
        speechSynthesis.cancel()
    })
  }

  _updateTripCard(p: NavigationProgress): void {
    const card = this._card
    if (!card)
      return
    const locale = this.locale
    const [value, unit] = formatDistance(p.distanceRemaining, this.options.units, locale).split(' ')
    const set = (selector: string, text: string): void => {
      const el = card.querySelector(selector)
      if (el && el.textContent !== text)
        el.textContent = text
    }
    set('.tsmap-nav-arrival', formatDate(p.arrival, locale, { hour: 'numeric', minute: '2-digit' }))
    set('.tsmap-nav-minutes', String(Math.max(1, Math.round(p.durationRemaining / 60))))
    set('.tsmap-nav-left', value ?? '')
    set('.tsmap-nav-left-unit', unit ?? '')
  }

  _showRecenter(): void {
    if (this._recenter)
      return
    const button = this._recenter = this._panel('tsmap-nav-recenter')
    button.textContent = message(this.locale, 'nav.resume')
    button.addEventListener('click', () => this.recenter())
  }
}

export function turnByTurn(map: any, options?: TurnByTurnOptions): TurnByTurn {
  return new TurnByTurn(map, options)
}

/** "12 min", "1 hr 5 min"; "1 Std. 5 Min." in German. */
export function formatDuration(seconds: number, locale?: string): string {
  const t = translator(locale)
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60)
    return t('duration.min', { minutes: String(minutes) })
  const hours = String(Math.floor(minutes / 60))
  const rest = minutes % 60
  return rest ? t('duration.hrMin', { hours, minutes: String(rest) }) : t('duration.hr', { hours })
}

/**
 * The voice to speak a locale with: one for exactly that locale (`de-AT`),
 * else one for its language (`de-DE`), else none, leaving it to the browser.
 */
export function voiceFor<V extends { lang: string }>(locale: string, voices: readonly V[]): V | undefined {
  const tag = (lang: string): string => lang.toLowerCase().replace(/_/g, '-')
  const want = tag(locale)
  const language = want.split('-')[0]
  return voices.find(v => tag(v.lang) === want) ?? voices.find(v => tag(v.lang).split('-')[0] === language)
}

/** The word before the road in a banner, by language: "Turn right onto Market St". */
const ONTO: Record<string, string> = { en: ' onto ', de: ' auf ' }

/** The banner's road, with the name part of the instruction dropped: Apple shows just the road under the distance. */
function abbreviated(banner: string, name: string, locale?: string): string {
  const word = ONTO[languageOf(locale)] ?? ONTO.en!
  const onto = banner.lastIndexOf(word)
  return onto >= 0 ? banner.slice(onto + word.length) : banner || name
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
}
