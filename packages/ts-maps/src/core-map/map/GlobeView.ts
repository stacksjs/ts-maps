/**
 * The globe, drawn.
 *
 * Zoomed out with `projection: 'globe'`, the map is a sphere: a WebGL canvas
 * under the labels, textured with the very tiles the flat map has loaded.
 * Each frame the fragment shader turns every pixel of the disc back into a
 * latitude and longitude, then into a Mercator pixel, and reads it from an
 * atlas of those tiles. The tiles themselves are left where they are, hidden,
 * so every tile layer — raster, vector, hillshade, heatmap — goes onto the
 * globe without knowing it.
 *
 * Everything else stays in screen space and asks the map where things are:
 * the map's container-to-ground maths answers through `globeProject` and
 * `globeUnproject` while the globe shows, as it answers through the camera
 * when the map is tilted. So labels stand upright on the sphere, markers ride
 * it and hide round the back, and a drag turns the globe under the pointer.
 *
 * Between zoom 5.5 and 6 the globe fades into the flat map. By then its
 * radius is matched to the flat map's scale at the centre, so the hand-over
 * is a cross-fade of two pictures of the same place.
 */

export const GLOBE_START_ZOOM = 5.5
export const GLOBE_END_ZOOM = 6

const DEG = Math.PI / 180
const MAX_LAT = 85.051129

/** Where the globe is on screen, and which way it faces. */
export interface GlobeCamera {
  /** The centre of the view, degrees. */
  lat: number
  lng: number
  /** The globe's radius, CSS pixels. */
  radius: number
  /** The centre of the view, container pixels. */
  cx: number
  cy: number
  /** Degrees; the map turns counter-clockwise by it, as a flat map does. */
  bearing: number
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** How much of the globe shows: 1 below zoom 5.5, 0 from zoom 6. */
export function globeFade(zoom: number): number {
  return 1 - smoothstep(GLOBE_START_ZOOM, GLOBE_END_ZOOM, zoom)
}

/**
 * The globe's radius in pixels, for a world `worldSize` pixels round.
 *
 * Zoomed right out, the sphere is as big around as the flat world is wide.
 * Closer in it grows with the centre's latitude — the secant, as Mercator
 * stretches — so that by the hand-over a pixel at the centre covers the same
 * ground on both.
 */
export function globeRadius(worldSize: number, zoom: number, lat: number): number {
  const t = smoothstep(3, GLOBE_START_ZOOM, zoom)
  const stretch = 1 / Math.cos(Math.min(80, Math.abs(lat)) * DEG)
  return worldSize / (2 * Math.PI) * (1 + (stretch - 1) * t)
}

type Vec3 = [number, number, number]

/** East, north and out of the screen, at the centre of the view. */
function basis(lat: number, lng: number): { e: Vec3, n: Vec3, d: Vec3 } {
  const p = lat * DEG
  const l = lng * DEG
  return {
    e: [Math.cos(l), 0, -Math.sin(l)],
    n: [-Math.sin(p) * Math.sin(l), Math.cos(p), -Math.sin(p) * Math.cos(l)],
    d: [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)],
  }
}

/**
 * A place to container pixels. `z` is how far it faces the viewer: 1 at the
 * centre, 0 on the rim, negative round the back.
 */
export function globeProject(cam: GlobeCamera, lat: number, lng: number): { x: number, y: number, z: number } {
  const { e, n, d } = basis(cam.lat, cam.lng)
  const p = lat * DEG
  const l = lng * DEG
  const v: Vec3 = [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)]
  const gx = v[0] * e[0] + v[1] * e[1] + v[2] * e[2]
  const gy = -(v[0] * n[0] + v[1] * n[1] + v[2] * n[2])
  const z = v[0] * d[0] + v[1] * d[1] + v[2] * d[2]
  const b = -cam.bearing * DEG
  const x = gx * Math.cos(b) - gy * Math.sin(b)
  const y = gx * Math.sin(b) + gy * Math.cos(b)
  return { x: cam.cx + x * cam.radius, y: cam.cy + y * cam.radius, z }
}

/**
 * Container pixels to a place. Off the disc, the place on the rim in that
 * direction, so a point in space still answers with somewhere. The longitude
 * comes back within half a world of the centre's, as the flat map's does.
 */
export function globeUnproject(cam: GlobeCamera, x: number, y: number, rim: number = 0.999): { lat: number, lng: number, onGlobe: boolean } {
  const sx = (x - cam.cx) / cam.radius
  const sy = (y - cam.cy) / cam.radius
  const b = cam.bearing * DEG
  const gx = sx * Math.cos(b) - sy * Math.sin(b)
  const gy = sx * Math.sin(b) + sy * Math.cos(b)
  let px = gx
  let py = -gy
  const r = Math.hypot(px, py)
  if (r > rim) {
    px *= rim / r
    py *= rim / r
  }
  const pz = Math.sqrt(Math.max(0, 1 - px * px - py * py))
  const { e, n, d } = basis(cam.lat, cam.lng)
  const w = [0, 1, 2].map(i => px * e[i] + py * n[i] + pz * d[i])
  const lat = Math.asin(Math.max(-1, Math.min(1, w[1]))) / DEG
  let lng = Math.atan2(w[0], w[2]) / DEG
  lng = cam.lng + ((((lng - cam.lng + 180) % 360) + 360) % 360) - 180
  return { lat, lng, onGlobe: r <= 1 }
}

const VERTEX = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAGMENT = `
precision highp float;
uniform sampler2D u_atlas;
uniform vec2 u_center;
uniform float u_radius;
uniform vec2 u_rot;
uniform vec3 u_e;
uniform vec3 u_n;
uniform vec3 u_d;
uniform float u_lng0;
uniform float u_world;
uniform vec4 u_window;
uniform vec4 u_ground;
uniform vec4 u_space;
uniform vec4 u_halo;
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
const float MAX_LAT = ${(MAX_LAT * DEG).toFixed(6)};
void main() {
  vec2 q = (gl_FragCoord.xy - u_center) / u_radius;
  vec2 s = vec2(q.x, -q.y);
  vec2 g = vec2(s.x * u_rot.x - s.y * u_rot.y, s.x * u_rot.y + s.y * u_rot.x);
  vec2 p = vec2(g.x, -g.y);
  float r = length(p);
  float edge = 1.5 / u_radius;
  float glow = exp(-max(r - 1.0, 0.0) * 14.0);
  vec4 space = mix(u_space, u_halo, glow * u_halo.a);
  space.a = 1.0;
  if (r > 1.0 + edge) {
    gl_FragColor = space;
    return;
  }
  vec2 pc = r > 1.0 ? p / r : p;
  float z = sqrt(max(0.0, 1.0 - dot(pc, pc)));
  vec3 w = pc.x * u_e + pc.y * u_n + z * u_d;
  float lat = clamp(asin(clamp(w.y, -1.0, 1.0)), -MAX_LAT, MAX_LAT);
  float lng = atan(w.x, w.z);
  lng = u_lng0 + mod(lng - u_lng0 + PI, TAU) - PI;
  float my = 0.5 - log(tan(0.25 * PI + 0.5 * lat)) / TAU;
  vec2 m = vec2(lng / TAU + 0.5, my) * u_world;
  vec2 uv = (m - u_window.xy) / u_window.zw;
  // Over the pole, the far side's longitudes run past the window's world.
  if (uv.x < 0.0)
    uv.x += u_world / u_window.z;
  else if (uv.x > 1.0)
    uv.x -= u_world / u_window.z;
  vec4 ground = u_ground;
  if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0) {
    vec4 tile = texture2D(u_atlas, uv);
    ground = vec4(mix(u_ground.rgb, tile.rgb, tile.a), 1.0);
  }
  ground.rgb = mix(ground.rgb, u_halo.rgb, pow(1.0 - z, 3.0) * 0.5 * u_halo.a);
  gl_FragColor = mix(space, ground, smoothstep(1.0 + edge, 1.0 - edge, r));
}
`

interface TileHost {
  _tiles?: Record<string, { el: HTMLElement, coords: { x: number, y: number, z: number }, loaded?: number }>
  _tileZoom?: number
  _container?: HTMLElement
  getTileSize: () => { x: number }
  options?: { opacity?: number }
  on: (types: string, fn: () => void) => void
  off: (types: string, fn: () => void) => void
}

/** The parts of the map the globe reads. */
export interface GlobeMap {
  _container: HTMLElement
  _layers: Record<number, unknown>
  _isGlobeProjection: () => boolean
  _globeCamera: () => GlobeCamera
  getZoom: () => number
  getPane: (name: string) => HTMLElement | undefined
  on: (types: string, fn: (e?: any) => void) => void
  off: (types: string, fn: (e?: any) => void) => void
  _updateAtmosphereOverlay: () => void
  _fog?: { 'color'?: string, 'high-color'?: string, 'space-color'?: string } | null
}

function isTileHost(layer: unknown): layer is TileHost {
  return !!layer && typeof layer === 'object' && '_tiles' in layer && typeof (layer as TileHost).getTileSize === 'function'
}

/** An image drawn on another origin without CORS would taint the atlas. */
function drawable(el: HTMLElement): el is HTMLCanvasElement | HTMLImageElement {
  if (el instanceof HTMLCanvasElement)
    return el.width > 0 && el.height > 0
  if (el instanceof HTMLImageElement) {
    if (!el.complete || !el.naturalWidth)
      return false
    if (el.crossOrigin != null)
      return true
    try {
      return new URL(el.src, location.href).origin === location.origin
    }
    catch {
      return false
    }
  }
  return false
}

export class GlobeView {
  _map: GlobeMap
  _canvas: HTMLCanvasElement
  _gl: WebGLRenderingContext | null = null
  _program: WebGLProgram | null = null
  _texture: WebGLTexture | null = null
  _uniforms: Record<string, WebGLUniformLocation | null> = {}
  _atlas: HTMLCanvasElement
  _window: { x: number, y: number, w: number, h: number, world: number } = { x: 0, y: 0, w: 1, h: 1, world: 1 }
  _dirty = true
  _frame = 0
  _shown = false
  _hosts: Set<TileHost> = new Set()
  _onChange = (): void => this.schedule()
  _onTiles = (): void => {
    this._dirty = true
    this.schedule()
  }

  _onLayer = (e?: { layer?: unknown }): void => {
    this._watch(e?.layer)
    this._onTiles()
  }

  constructor(map: GlobeMap) {
    this._map = map
    const doc = map._container.ownerDocument ?? document
    this._canvas = doc.createElement('canvas')
    this._canvas.className = 'tsmap-globe'
    Object.assign(this._canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', zIndex: '399', pointerEvents: 'none', display: 'none' })
    this._atlas = doc.createElement('canvas')
    try {
      this._gl = (this._canvas.getContext('webgl2', { alpha: false, antialias: false }) ?? this._canvas.getContext('webgl', { alpha: false, antialias: false })) as WebGLRenderingContext | null
    }
    catch {
      this._gl = null
    }
    if (!this._gl || !this._init(this._gl)) {
      this._gl = null
      return
    }
    map._container.appendChild(this._canvas)
    map.on('move zoom rotate pitch resize viewreset moveend zoomend', this._onChange)
    map.on('styledata layeradd layerremove', this._onLayer)
    for (const layer of Object.values(map._layers))
      this._watch(layer)
    this.schedule()
  }

  /** Whether this browser draws the globe: WebGL, and a shader that built. */
  get ready(): boolean {
    return !!this._gl
  }

  /** Whether the globe shows now. */
  active(): boolean {
    return this.ready && this._map._isGlobeProjection() && this._map.getZoom() < GLOBE_END_ZOOM
  }

  _init(gl: WebGLRenderingContext): boolean {
    const shader = (type: number, source: string): WebGLShader | null => {
      const s = gl.createShader(type)
      if (!s)
        return null
      gl.shaderSource(s, source)
      gl.compileShader(s)
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
    }
    const vs = shader(gl.VERTEX_SHADER, VERTEX)
    const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!vs || !fs || !program)
      return false
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      return false
    this._program = program
    gl.useProgram(program)
    // One triangle over the whole canvas.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const at = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(at)
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)
    for (const name of ['u_atlas', 'u_center', 'u_radius', 'u_rot', 'u_e', 'u_n', 'u_d', 'u_lng0', 'u_world', 'u_window', 'u_ground', 'u_space', 'u_halo'])
      this._uniforms[name] = gl.getUniformLocation(program, name)
    this._texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.uniform1i(this._uniforms.u_atlas, 0)
    return true
  }

  _watch(layer: unknown): void {
    if (!isTileHost(layer) || this._hosts.has(layer))
      return
    this._hosts.add(layer)
    layer.on('tileload tileunload load repaint', this._onTiles)
  }

  schedule(): void {
    if (!this._gl || this._frame)
      return
    this._frame = requestAnimationFrame(() => {
      this._frame = 0
      this._render()
    })
  }

  /** The tile layers on the map, bottom first. */
  _layers(): TileHost[] {
    const pane = this._map.getPane('tilePane')
    const order = pane ? Array.from(pane.children) : []
    for (const host of this._hosts) {
      if (!Object.values(this._map._layers).includes(host)) {
        host.off('tileload tileunload load repaint', this._onTiles)
        this._hosts.delete(host)
      }
    }
    return [...this._hosts].sort((a, b) => order.indexOf(a._container as Element) - order.indexOf(b._container as Element))
  }

  /** Show or hide the globe, and the flat tiles under it. */
  _show(fade: number): void {
    const shown = fade > 0
    this._canvas.style.display = shown ? 'block' : 'none'
    this._canvas.style.opacity = String(fade)
    for (const name of ['tilePane', 'overlayPane']) {
      const pane = this._map.getPane(name)
      if (pane)
        pane.style.opacity = shown ? String(1 - fade) : ''
    }
    if (shown !== this._shown) {
      this._shown = shown
      this._map._updateAtmosphereOverlay()
    }
  }

  /** The loaded tiles, drawn into one picture of the part of the world they cover. */
  _buildAtlas(gl: WebGLRenderingContext): void {
    const layers = this._layers()
    let zoom = -Infinity
    for (const layer of layers) {
      if (layer._tileZoom !== undefined)
        zoom = Math.max(zoom, layer._tileZoom)
    }
    if (!Number.isFinite(zoom))
      return

    type Placed = { el: HTMLCanvasElement | HTMLImageElement, x: number, y: number, size: number, z: number }
    const draws: Array<{ layer: TileHost, tiles: Placed[] }> = []
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const layer of layers) {
      const T = layer.getTileSize().x
      const tiles: Placed[] = []
      for (const tile of Object.values(layer._tiles ?? {})) {
        const c = tile.coords
        const k = 2 ** (zoom - c.z)
        const placed = { el: tile.el as HTMLCanvasElement, x: c.x * T * k, y: c.y * T * k, size: T * k, z: c.z }
        // The window is the current level's tiles; a coarser one standing in
        // for them is cut to it.
        if (c.z === layer._tileZoom) {
          minX = Math.min(minX, placed.x)
          minY = Math.min(minY, placed.y)
          maxX = Math.max(maxX, placed.x + placed.size)
          maxY = Math.max(maxY, placed.y + placed.size)
        }
        if (tile.loaded && drawable(tile.el))
          tiles.push(placed)
      }
      tiles.sort((a, b) => a.z - b.z)
      draws.push({ layer, tiles })
    }
    if (!Number.isFinite(minX))
      return

    const w = maxX - minX
    const h = maxY - minY
    const limit = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)
    const scale = Math.min(Math.min(2, globalThis.devicePixelRatio || 1), limit / w, limit / h)
    const atlas = this._atlas
    atlas.width = Math.max(1, Math.ceil(w * scale))
    atlas.height = Math.max(1, Math.ceil(h * scale))
    const ctx = atlas.getContext('2d')
    if (!ctx)
      return
    ctx.clearRect(0, 0, atlas.width, atlas.height)
    for (const { layer, tiles } of draws) {
      ctx.globalAlpha = layer.options?.opacity ?? 1
      for (const t of tiles) {
        // A hair over, so neighbouring tiles leave no seam between them.
        ctx.drawImage(t.el, (t.x - minX) * scale - 0.25, (t.y - minY) * scale - 0.25, t.size * scale + 0.5, t.size * scale + 0.5)
      }
    }
    ctx.globalAlpha = 1

    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
    this._window = { x: minX, y: minY, w, h, world: 256 * 2 ** zoom }
  }

  _render(): void {
    const gl = this._gl
    if (!gl)
      return
    const fade = this.active() ? globeFade(this._map.getZoom()) : 0
    this._show(fade)
    if (!fade)
      return

    const canvas = this._canvas
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1)
    const width = Math.round(canvas.clientWidth * ratio)
    const height = Math.round(canvas.clientHeight * ratio)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    gl.viewport(0, 0, width, height)

    if (this._dirty) {
      this._dirty = false
      this._buildAtlas(gl)
    }

    const cam = this._map._globeCamera()
    const { e, n, d } = basis(cam.lat, cam.lng)
    const u = this._uniforms
    const win = this._window
    gl.useProgram(this._program)
    gl.uniform2f(u.u_center, cam.cx * ratio, height - cam.cy * ratio)
    gl.uniform1f(u.u_radius, cam.radius * ratio)
    gl.uniform2f(u.u_rot, Math.cos(cam.bearing * DEG), Math.sin(cam.bearing * DEG))
    gl.uniform3f(u.u_e, e[0], e[1], e[2])
    gl.uniform3f(u.u_n, n[0], n[1], n[2])
    gl.uniform3f(u.u_d, d[0], d[1], d[2])
    gl.uniform1f(u.u_lng0, cam.lng * DEG)
    gl.uniform1f(u.u_world, win.world)
    gl.uniform4f(u.u_window, win.x, win.y, win.w, win.h)
    const dark = this._map._container.classList.contains('tsmap-dark')
    const fog = this._map._fog ?? {}
    const ground = this._color(getComputedStyle(this._map._container).backgroundColor, dark ? '#1c2026' : '#eef0f2')
    const space = this._color(fog['space-color'], dark ? '#0b0f17' : '#dde5ee')
    const halo = this._color(fog['high-color'] ?? fog.color, dark ? '#3a4d6b' : '#ffffff')
    gl.uniform4f(u.u_ground, ground[0], ground[1], ground[2], 1)
    gl.uniform4f(u.u_space, space[0], space[1], space[2], 1)
    gl.uniform4f(u.u_halo, halo[0], halo[1], halo[2], 0.9)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  _colors: Map<string, [number, number, number]> = new Map()

  /** A CSS colour as 0–1 RGB, read back off a pixel so any CSS colour works. */
  _color(css: string | undefined, fallback: string): [number, number, number] {
    const value = css && css !== 'transparent' && css !== 'rgba(0, 0, 0, 0)' ? css : fallback
    const known = this._colors.get(value)
    if (known)
      return known
    const probe = this._map._container.ownerDocument.createElement('canvas')
    probe.width = probe.height = 1
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    let rgb: [number, number, number] = [0.9, 0.92, 0.94]
    if (ctx) {
      ctx.fillStyle = fallback
      ctx.fillStyle = value
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      rgb = [r / 255, g / 255, b / 255]
    }
    this._colors.set(value, rgb)
    return rgb
  }

  remove(): void {
    if (this._frame)
      cancelAnimationFrame(this._frame)
    this._frame = 0
    this._show(0)
    this._map.off('move zoom rotate pitch resize viewreset moveend zoomend', this._onChange)
    this._map.off('styledata layeradd layerremove', this._onLayer)
    for (const host of this._hosts)
      host.off('tileload tileunload load repaint', this._onTiles)
    this._hosts.clear()
    this._canvas.remove()
    const lose = this._gl?.getExtension('WEBGL_lose_context')
    lose?.loseContext()
    this._gl = null
  }
}
