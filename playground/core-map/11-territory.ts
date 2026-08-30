/**
 * Phase 11 demo — capturing territory by running around it.
 *
 * The whole loop of a running-territory game, end to end and with no network:
 *
 *   - a simulated runner emitting GPS positions once a tick, with jitter
 *   - `LoopDetector` noticing when the path closes, by crossing or by return
 *   - `TerritoryStore` merging the claim into what the player already holds
 *     and taking the overlap off everyone else
 *   - `TerritoryLayer` drawing it, with the capture sweep
 *   - `RunTrailLayer` showing the live trail and what the loop is worth
 *     before it closes
 *
 * Rivals are seeded with territory so the steal is visible, and the
 * leaderboard is driven from the store rather than kept alongside it.
 */

import type { Position } from '../../packages/ts-maps/src/core-map'
import {
  control,
  formatArea,
  formatDistance,
  GridLayer,
  LoopDetector,
  RunTrailLayer,
  TerritoryLayer,
  TerritoryStore,
  TsMap,
} from '../../packages/ts-maps/src/core-map'

// --- Synthetic basemap ------------------------------------------------------
// A street grid drawn as a plain canvas tile layer, so the demo runs offline
// and the territories still have something to sit over.

const CENTER: [number, number] = [34.0195, -118.4720]

function gridTileLayer(): GridLayer {
  const layer = new GridLayer({ tileSize: 256 })
  layer.createTile = function createTile(coords: any): HTMLCanvasElement {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return canvas

    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, size, size)

    // Blocks roughly 90 m on a side at zoom 16.
    const step = 32
    ctx.strokeStyle = '#1f2933'
    ctx.lineWidth = 6
    ctx.beginPath()
    for (let x = 0; x <= size; x += step) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, size)
    }
    for (let y = 0; y <= size; y += step) {
      ctx.moveTo(0, y)
      ctx.lineTo(size, y)
    }
    ctx.stroke()

    ctx.strokeStyle = '#2b3644'
    ctx.lineWidth = 1
    ctx.stroke()

    // A park, so there is something worth running around.
    if (coords.z >= 14) {
      ctx.fillStyle = 'rgba(34, 84, 61, 0.55)'
      ctx.fillRect(step * 2, step * 2, step * 3, step * 2)
    }

    return canvas
  }
  return layer
}

// --- The map ----------------------------------------------------------------

const map = new TsMap('map', {
  center: CENTER,
  zoom: 16,
  theme: 'dark',
  zoomControl: false,
})

map.addLayer(gridTileLayer())
control.zoom({ position: 'bottomright' }).addTo(map)
control.scale({ position: 'bottomleft' }).addTo(map)

// --- Game state -------------------------------------------------------------

const SELF = 'you'
const store = new TerritoryStore()

const territories = new TerritoryLayer({
  store,
  self: SELF,
  styles: {
    [SELF]: { color: '#38bdf8' },
    riley: { color: '#f97316' },
    nadia: { color: '#a855f7' },
  },
  labelMinZoom: 15,
})
map.addLayer(territories as any)

const trail = new RunTrailLayer({ color: '#38bdf8', showPotential: true })
map.addLayer(trail as any)

/** A square of `metres` a side, centred on an offset from the map centre. */
function block(eastM: number, northM: number, metres: number): Position[] {
  const mLat = 1 / 111320
  const mLng = 1 / (111320 * Math.cos((CENTER[0] * Math.PI) / 180))
  const cx = CENTER[1] + eastM * mLng
  const cy = CENTER[0] + northM * mLat
  const h = metres / 2
  return [
    [cx - h * mLng, cy - h * mLat],
    [cx + h * mLng, cy - h * mLat],
    [cx + h * mLng, cy + h * mLat],
    [cx - h * mLng, cy + h * mLat],
    [cx - h * mLng, cy - h * mLat],
  ]
}

// Rivals already hold ground, so a lap over it visibly takes it.
store.capture('riley', block(120, 60, 220))
store.capture('riley', block(300, 60, 180))
store.capture('nadia', block(-190, -140, 260))

// --- The runner -------------------------------------------------------------

const detector = new LoopDetector({ snapDistance: 22, minArea: 400, minLoopLength: 150 })

interface RouteLeg {
  east: number
  north: number
}

/** A lap that overlaps Riley's block, then a bigger one around it. */
const ROUTES: RouteLeg[][] = [
  // A tight lap of the park.
  [
    { east: -120, north: -60 },
    { east: 40, north: -60 },
    { east: 40, north: 80 },
    { east: -120, north: 80 },
    { east: -120, north: -62 },
  ],
  // Straight over Riley's ground.
  [
    { east: 40, north: -20 },
    { east: 230, north: -20 },
    { east: 230, north: 150 },
    { east: 40, north: 150 },
    { east: 40, north: -22 },
  ],
  // A long one that swallows the lot.
  [
    { east: -260, north: -220 },
    { east: 380, north: -220 },
    { east: 380, north: 230 },
    { east: -260, north: 230 },
    { east: -260, north: -222 },
  ],
]

const mLat = 1 / 111320
const mLng = 1 / (111320 * Math.cos((CENTER[0] * Math.PI) / 180))

function toPosition(leg: RouteLeg): Position {
  return [CENTER[1] + leg.east * mLng, CENTER[0] + leg.north * mLat]
}

/** Walk a route leg by leg, emitting a position every `stride` metres. */
function* routePoints(route: RouteLeg[], stride = 12): Generator<Position> {
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1]
    const to = route[i]
    const distance = Math.hypot(to.east - from.east, to.north - from.north)
    const steps = Math.max(1, Math.round(distance / stride))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      // A metre or two of jitter, which is what a GPS actually gives and what
      // the loop detector has to cope with.
      yield toPosition({
        east: from.east + (to.east - from.east) * t + (Math.random() - 0.5) * 3,
        north: from.north + (to.north - from.north) * t + (Math.random() - 0.5) * 3,
      })
    }
  }
}

// --- Chrome -----------------------------------------------------------------

const board = document.getElementById('board') as HTMLElement
const status = document.getElementById('status') as HTMLElement
const toast = document.getElementById('toast') as HTMLElement

function renderBoard(): void {
  const entries = store.leaderboard()
  board.innerHTML = entries.length === 0
    ? '<div class="empty">No territory claimed yet.</div>'
    : entries.map(entry => `
      <div class="row${entry.owner === SELF ? ' self' : ''}">
        <span class="swatch" style="background:${territories.colorFor(entry.owner)}"></span>
        <span class="name">${entry.owner}</span>
        <span class="area">${formatArea(entry.area)}</span>
      </div>
    `).join('')
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
function showToast(html: string): void {
  toast.innerHTML = html
  toast.classList.add('visible')
  if (toastTimer)
    clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200)
}

store.on('capture', (result: any) => {
  const stolenText = result.stolen.length > 0
    ? ` · took ${formatArea(result.stolen[0].area)} from <b>${result.stolen[0].owner}</b>`
    : ''
  showToast(`<b>${result.owner}</b> claimed ${formatArea(result.areaGained)}${stolenText}`)
  renderBoard()
})

function updateStatus(): void {
  const potential = detector.track.length >= 3
    ? store.preview(SELF, [...detector.track, detector.track[0]])
    : { areaGained: 0, stolen: [] as any[] }

  status.innerHTML = `
    <span>${formatDistance(detector.length)} since last capture</span>
    <span class="dim">·</span>
    <span>closing now: <b>${formatArea(potential.areaGained)}</b></span>
  `
}

// --- Run --------------------------------------------------------------------

let running = false
let timer: ReturnType<typeof setInterval> | undefined
let route = 0
let points: Generator<Position> | null = null

function tick(): void {
  if (!points) {
    points = routePoints(ROUTES[route % ROUTES.length])
    route++
  }

  const next = points.next()
  if (next.done) {
    points = null
    return
  }

  const position = next.value
  const loop = detector.push(position)
  trail.setTrack([...detector.track])

  if (loop)
    store.capture(SELF, loop.ring)

  updateStatus()
}

const runButton = document.getElementById('run') as HTMLButtonElement
runButton.addEventListener('click', () => {
  running = !running
  runButton.textContent = running ? 'Pause run' : 'Start run'
  if (running) {
    timer = setInterval(tick, 90)
  }
  else if (timer) {
    clearInterval(timer)
  }
})

const resetButton = document.getElementById('reset') as HTMLButtonElement
resetButton.addEventListener('click', () => {
  store.clear()
  detector.reset()
  trail.clear()
  route = 0
  points = null
  store.capture('riley', block(120, 60, 220))
  store.capture('riley', block(300, 60, 180))
  store.capture('nadia', block(-190, -140, 260))
  renderBoard()
  updateStatus()
})

// Clicking a territory says who holds it.
map.on('click', (event: any) => {
  const owner = territories.ownerAtContainerPoint(event.containerPoint)
  showToast(owner ? `That ground belongs to <b>${owner}</b>.` : 'Nobody holds that ground yet.')
})

renderBoard()
updateStatus()

// Exposed for the in-browser checks.
const scope = window as unknown as Record<string, unknown>
scope.demo = { map, store, territories, trail, detector, tick }
