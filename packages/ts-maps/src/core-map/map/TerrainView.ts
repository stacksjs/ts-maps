/**
 * The ground, raised.
 *
 * With `setTerrain` on, the map is a surface: a WebGL canvas in the map pane,
 * over the tiles and under the buildings, labels and markers, drawing a mesh
 * whose every vertex stands off the flat map by the height of the ground
 * there. Mountains stand up and valleys sink.
 *
 * The picture on the mesh is exactly what the flat map shows. Each frame the
 * loaded tiles of every tile layer — vector, raster, hillshade — are drawn
 * into an off-screen image through the very camera the flat map's CSS uses,
 * so that image is the flat map, pixel for pixel. The mesh then reads it back
 * at the point where the flat map shows each spot of ground. The tiles
 * themselves stay where they are, hidden, and no layer knows the difference.
 * (GlobeView.ts does the same for the globe, with a Mercator atlas; a pitched
 * view needs the flat picture instead, which spends its pixels where the
 * screen does — near the camera — however far the view reaches.)
 *
 * ## The camera
 *
 * The flat map tilts its ground panes with `perspective(h) rotateX(pitch)
 * rotate(-bearing)` about the view's centre (`TsMap._applyCameraTransform`):
 * a ground point `(x, y)` from the centre, turned by the bearing, is drawn at
 * `h·(x, y·cos) / (h − y·sin)`. The terrain uses the same camera, with the
 * ground's height added along the tilted ground's up axis, `(0, −sin, cos)`
 * in the same pixels as distance along the ground. At no height it is that
 * formula exactly, so the surface lines up with the flat map wherever the
 * ground is at the reference height.
 *
 * ## The reference height
 *
 * Heights are measured from the ground at the centre of the view, not from
 * the sea. In the Alps at zoom 14 the ground is 1000 px or more above sea
 * level: raised from the sea, the whole view would lift off the top of the
 * screen and leave bare ground with no tiles below it. Measured from the
 * centre, the centre stays where it is — the camera rides over the ground,
 * as Mapbox's does — and only the relief around it moves.
 *
 * ## Everything else
 *
 * Labels, markers and popups stay in their screen-space panes above, and ask
 * the map where things are: `layerPointToContainerPoint` answers through
 * `project` while the terrain is drawn, so they stand on the mountain, not on
 * the flat map under it. A click is cast down onto the surface (`pick`), so
 * it lands on the slope under the pointer.
 */

import { buildTerrainGrid, type TerrainGrid } from '../geo/terrainMesh'
import type { TerrainSource } from '../geo/TerrainSource'

const DEG = Math.PI / 180
/** The Earth's radius in metres, as Web Mercator (EPSG:3857) has it. */
const EARTH_RADIUS = 6378137
/** Cells a side per ground patch: about 8 px each for a 512 px tile. */
const PATCH_RESOLUTION = 64
/** How far past each edge of the view the flat picture reaches, as a fraction of it. */
const MARGIN = 0.25
/** A height the DEM has no answer for yet; the shader draws it flat. */
const NO_DATA = -1e6
/** The depth map for hiding labels is a quarter of the view's size each way. */
const DEPTH_SCALE = 4

/**
 * How far below a patch its skirt hangs: deep enough to close a crack
 * between patches of different detail, shallow enough not to show as a wall
 * at the edge of the drawn ground.
 */
function skirt(patchSize: number): number {
  return patchSize * 0.02
}

/** The surface's distance from the camera over the screen (`TerrainView._depthMap`). */
interface DepthMap {
  frame: Frame
  patches: Patch[]
  w: number
  h: number
  far: number
  /** RGB per cell: distance over `far`, in 24 bits; alpha 0 where no ground is drawn. */
  data: Uint8Array
}

/**
 * The flat map's camera, in the terms the terrain needs. Built by
 * `TerrainView.frame()` from the map; plain numbers, so the projection maths
 * can be tested without one.
 */
export interface TerrainCamera {
  /** Where the view's centre is drawn: container pixels, the pane offset included. */
  cx: number
  cy: number
  /** The layer point the camera turns about — the view's centre in layer pixels. */
  lx: number
  ly: number
  /** Degrees; the map turns counter-clockwise by it. */
  bearing: number
  /** Degrees. */
  pitch: number
  /** The camera's distance from the ground at the centre, pixels: `(H/2) / tan(fov/2)`. */
  h: number
}

/**
 * A layer point raised `lift` pixels off the ground, to container pixels.
 * `depth` is its distance from the camera along the view; not positive
 * behind it.
 *
 * At `lift` 0 this is `layerPointToContainerPoint`'s maths: turn by the
 * bearing about the centre, then `_pitchPoint`.
 */
export function projectTerrainPoint(cam: TerrainCamera, x: number, y: number, lift: number): { x: number, y: number, depth: number } {
  const b = -cam.bearing * DEG
  const t = cam.pitch * DEG
  const dx = x - cam.lx
  const dy = y - cam.ly
  const rx = dx * Math.cos(b) - dy * Math.sin(b)
  const ry = dx * Math.sin(b) + dy * Math.cos(b)
  const st = Math.sin(t)
  const ct = Math.cos(t)
  const depth = cam.h - ry * st - lift * ct
  return {
    x: cam.cx + cam.h * rx / depth,
    y: cam.cy + cam.h * (ry * ct - lift * st) / depth,
    depth,
  }
}

/**
 * The inverse at a known height: the layer point which, raised `lift` pixels,
 * is drawn at container point `(sx, sy)`. The ray through that pixel meets
 * the level `lift` above the ground there. `null` when it never does — at or
 * above that level's horizon.
 */
export function unprojectTerrainPoint(cam: TerrainCamera, sx: number, sy: number, lift: number): { x: number, y: number } | null {
  const b = -cam.bearing * DEG
  const t = cam.pitch * DEG
  const st = Math.sin(t)
  const ct = Math.cos(t)
  const px = sx - cam.cx
  const py = sy - cam.cy
  // Solving `py = h·(ry·cos − lift·sin) / (h − ry·sin − lift·cos)` for ry.
  const denom = cam.h * ct + py * st
  if (denom <= 1e-9)
    return null
  const ry = (py * (cam.h - lift * ct) + cam.h * lift * st) / denom
  const depth = cam.h - ry * st - lift * ct
  if (depth <= 0)
    return null
  const rx = px * depth / cam.h
  return {
    x: cam.lx + rx * Math.cos(b) + ry * Math.sin(b),
    y: cam.ly - rx * Math.sin(b) + ry * Math.cos(b),
  }
}

/**
 * Pixels per metre on a map `worldSize` pixels round, at the latitude whose
 * Mercator `y` is `fy` (0 at the north edge of the world, 1 at the south).
 *
 * Mercator stretches the ground by the secant of the latitude, and so must a
 * height drawn in the same pixels; `1 / cos(lat)` is `cosh` of the Mercator
 * `y`, with no trigonometry to undo.
 */
export function pixelsPerMetre(worldSize: number, fy: number): number {
  return worldSize * Math.cosh(Math.PI * (1 - 2 * fy)) / (2 * Math.PI * EARTH_RADIUS)
}

interface TileHost {
  _tiles?: Record<string, { el: HTMLElement, coords: { x: number, y: number, z: number }, loaded?: number, current?: boolean }>
  _tileZoom?: number
  _container?: HTMLElement
  getTileSize: () => { x: number }
  options?: { opacity?: number }
  on: (types: string, fn: (e?: any) => void) => void
  off: (types: string, fn: (e?: any) => void) => void
}

/** The parts of the map the terrain reads. */
export interface TerrainMap {
  _container: HTMLElement
  _mapPane?: HTMLElement
  _layers: Record<number, unknown>
  _terrain?: { source: string, exaggeration?: number } | null
  _terrainSource?: TerrainSource
  _bearing?: number
  _pitch?: number
  _sky?: { 'horizon-color'?: string } | null
  _style?: { spec: { sources?: Record<string, any> } } | null
  options: { crs?: { scale: (zoom: number) => number } }
  getSize: () => { x: number, y: number }
  getZoom: () => number
  getZoomScale: (to: number, from: number) => number
  getPixelOrigin: () => { x: number, y: number }
  getPane: (name: string) => HTMLElement | undefined
  containerPointToLayerPoint: (point: any) => { x: number, y: number }
  layerPointToLatLng: (point: any) => any
  _getMapPanePos: () => { x: number, y: number }
  _cameraGeometry: () => { h: number }
  _horizonDistance: () => number
  _globeActive: () => boolean
  _maybeFetchTerrainTile: (coord: { z: number, x: number, y: number }) => void
  _terrainMissing?: Set<string>
  on: (types: string, fn: (e?: any) => void) => void
  off: (types: string, fn: (e?: any) => void) => void
}

/** Everything about the camera and the ground that holds for one frame. */
interface Frame {
  zoom: number
  ox: number
  oy: number
  px: number
  py: number
  w: number
  h: number
  bearing: number
  pitch: number
  source: TerrainSource | undefined
  version: number
  exaggeration: number
  cam: TerrainCamera
  /** The map's size in pixels at this zoom. */
  world: number
  /** The DEM zoom heights are read at: the finest the view asks for. */
  demZoom: number
  /** Metres: the height of the ground at the centre of the view. */
  ref: number
}

interface Patch {
  key: string
  z: number
  x: number
  y: number
  demZoom: number
  buffer: WebGLBuffer
  /** Metres, over the vertices the DEM has an answer for. */
  min: number
  max: number
}

const TILE_VERTEX = `
attribute vec2 a_pos;
uniform vec3 u_quad;
uniform vec4 u_cam;
uniform float u_h;
uniform vec2 u_screen;
uniform vec4 u_rect;
varying vec2 v_uv;
void main() {
  vec2 d = u_quad.xy + a_pos * u_quad.z;
  vec2 r = vec2(d.x * u_cam.x - d.y * u_cam.y, d.x * u_cam.y + d.y * u_cam.x);
  float w = u_h - r.y * u_cam.z;
  vec2 s = vec2(u_h * r.x, u_h * r.y * u_cam.w);
  vec2 ndc = (s + (u_screen - u_rect.xy) * w) / u_rect.zw * 2.0 - w;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, w);
  v_uv = a_pos;
}
`

const TILE_FRAGMENT = `
precision mediump float;
uniform sampler2D u_tile;
uniform float u_alpha;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_tile, v_uv) * u_alpha;
}
`

const MESH_VERTEX = `
attribute vec3 a_grid;
attribute float a_height;
uniform vec3 u_quad;
uniform vec4 u_cam;
uniform float u_h;
uniform vec2 u_screen;
uniform vec2 u_view;
uniform vec4 u_rect;
uniform float u_ref;
uniform float u_scale;
uniform float u_skirt;
uniform vec2 u_depth;
varying vec3 v_tex;
varying float v_w;
void main() {
  vec2 d = u_quad.xy + a_grid.xy * u_quad.z;
  vec2 r = vec2(d.x * u_cam.x - d.y * u_cam.y, d.x * u_cam.y + d.y * u_cam.x);
  float lift = a_height < ${(NO_DATA / 10).toFixed(1)} ? 0.0 : (a_height - u_ref) * u_scale;
  lift -= a_grid.z * u_skirt;
  float w = u_h - r.y * u_cam.z - lift * u_cam.w;
  vec2 s = vec2(u_h * r.x, u_h * (r.y * u_cam.w - lift * u_cam.z));
  vec2 ndc = (s + u_screen * w) / u_view * 2.0 - w;
  float n = u_depth.x;
  float f = u_depth.y;
  gl_Position = vec4(ndc.x, -ndc.y, ((f + n) * w - 2.0 * f * n) / (f - n), w);
  // Where the flat map draws this ground, in the flat picture, homogeneous:
  // divided per pixel, so it stays right across a triangle seen at a slant.
  float wf = u_h - r.y * u_cam.z;
  vec2 t = (vec2(u_h * r.x, u_h * r.y * u_cam.w) + (u_screen - u_rect.xy) * wf) / u_rect.zw;
  v_tex = vec3(t.x, wf - t.y, wf);
  v_w = w;
}
`

const MESH_FRAGMENT = `
precision highp float;
uniform sampler2D u_image;
uniform vec3 u_ground;
uniform vec4 u_fog;
uniform vec3 u_fogColor;
varying vec3 v_tex;
void main() {
  vec3 color = u_ground;
  if (v_tex.z > 0.0) {
    vec2 uv = v_tex.xy / v_tex.z;
    if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0) {
      vec4 tile = texture2D(u_image, uv);
      color = u_ground * (1.0 - tile.a) + tile.rgb;
    }
    // The haze the flat map lays over its most distant ground, at the same
    // place on the ground.
    if (u_fog.y > 0.0) {
      float y = u_fog.z + (1.0 - uv.y) * u_fog.w;
      color = mix(color, u_fogColor, 1.0 - smoothstep(u_fog.x, u_fog.x + u_fog.y, y));
    }
  }
  gl_FragColor = vec4(color, 1.0);
}
`

// The distance from the camera, over the far plane's, packed into 24 bits.
const DEPTH_FRAGMENT = `
precision highp float;
uniform float u_far;
varying float v_w;
void main() {
  float d = clamp(v_w / u_far, 0.0, 1.0);
  vec3 enc = fract(d * vec3(1.0, 255.0, 65025.0));
  enc -= enc.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0);
  gl_FragColor = vec4(enc, 1.0);
}
`

/**
 * Whether ground nearer the camera hides a point `distance` away drawn at
 * `(x, y)` on the canvas. The furthest surface among the four nearest cells
 * is taken, so a label on a ridge line or on its own slope is not hidden by
 * the slope it stands on.
 */
function hidden(map: DepthMap, x: number, y: number, distance: number): boolean {
  const cx = x / DEPTH_SCALE - 0.5
  const cy = map.h - y / DEPTH_SCALE - 0.5
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  let surface = 0
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const px = Math.min(map.w - 1, Math.max(0, x0 + i))
      const py = Math.min(map.h - 1, Math.max(0, y0 + j))
      const o = (py * map.w + px) * 4
      // No ground drawn there: nothing in front.
      if (!map.data[o + 3])
        return false
      surface = Math.max(surface, (map.data[o]! / 255 + map.data[o + 1]! / 65025 + map.data[o + 2]! / 16581375) * map.far)
    }
  }
  return distance > surface * 1.02 + 8
}

function isTileHost(layer: unknown): layer is TileHost {
  return !!layer && typeof layer === 'object' && '_tiles' in layer && typeof (layer as TileHost).getTileSize === 'function'
}

/** An image drawn on another origin without CORS cannot be uploaded. */
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

/**
 * A program from two shaders, `null` if either does not build. Attributes go
 * where `attributes` lists them, so programs sharing a vertex shader share
 * its buffers' bindings too.
 */
function compile(gl: WebGLRenderingContext, vertex: string, fragment: string, attributes: string[]): WebGLProgram | null {
  const shader = (type: number, source: string): WebGLShader | null => {
    const s = gl.createShader(type)
    if (!s)
      return null
    gl.shaderSource(s, source)
    gl.compileShader(s)
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
  }
  const vs = shader(gl.VERTEX_SHADER, vertex)
  const fs = shader(gl.FRAGMENT_SHADER, fragment)
  const program = gl.createProgram()
  if (!vs || !fs || !program)
    return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  attributes.forEach((name, i) => gl.bindAttribLocation(program, i, name))
  gl.linkProgram(program)
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null
}

export class TerrainView {
  _map: TerrainMap
  _canvas: HTMLCanvasElement
  _gl: WebGLRenderingContext | null = null
  _gl2 = false
  _tileProgram: WebGLProgram | null = null
  _meshProgram: WebGLProgram | null = null
  _tileUniforms: Record<string, WebGLUniformLocation | null> = {}
  _meshUniforms: Record<string, WebGLUniformLocation | null> = {}
  _depthProgram: WebGLProgram | null = null
  _depthUniforms: Record<string, WebGLUniformLocation | null> = {}
  _depthTarget: { fbo: WebGLFramebuffer | null, tex: WebGLTexture | null, depth: WebGLRenderbuffer | null, w: number, h: number } | null = null
  _depth: DepthMap | null = null
  /** The patches the last frame drew. */
  _drawn: Patch[] = []
  _tileAttrib = -1
  _gridAttrib = -1
  _heightAttrib = -1
  _quad: WebGLBuffer | null = null
  _grid: TerrainGrid
  _gridBuffer: WebGLBuffer | null = null
  _indexBuffer: WebGLBuffer | null = null
  _fbo: WebGLFramebuffer | null = null
  _image: WebGLTexture | null = null
  _imageSize = { w: 0, h: 0 }
  _anisotropy: { ext: any, max: number } | null = null
  /** One texture per tile picture, uploaded again only when it changes. */
  _textures: Map<HTMLElement, { tex: WebGLTexture, dirty: boolean }> = new Map()
  _patches: Map<string, Patch> = new Map()
  /** DEM tiles that arrived since the last frame, whose patches read heights again. */
  _arrived: Array<{ z: number, x: number, y: number }> = []
  _heightsVersion = -1
  _heightsSource: TerrainSource | undefined = undefined
  _frame = 0
  _shown = false
  _state: Frame | null = null
  _lastRef = 0
  /** The reference height and DEM version the upright panes were last placed for. */
  _placed: { ref: number, version: number, exaggeration: number } = { ref: Number.NaN, version: -1, exaggeration: Number.NaN }
  /** Metres: the lowest and highest ground drawn last frame, for `pick`. */
  _range: { min: number, max: number } | null = null
  _hosts: Set<TileHost> = new Set()

  _onChange = (): void => this.schedule()
  _onTileLoad = (e?: { tile?: HTMLElement }): void => {
    const known = e?.tile && this._textures.get(e.tile)
    if (known)
      known.dirty = true
    this.schedule()
  }

  _onTileUnload = (e?: { tile?: HTMLElement }): void => {
    if (e?.tile)
      this._dropTexture(e.tile)
    this.schedule()
  }

  /** A tile layer drew its tiles again in place, as a feature-state change does. */
  _onRepaint = (): void => {
    for (const entry of this._textures.values())
      entry.dirty = true
    this.schedule()
  }

  _onLayer = (e?: { layer?: unknown }): void => {
    this._watch(e?.layer)
    this.schedule()
  }

  _onDem = (e?: { coord?: { z: number, x: number, y: number } }): void => {
    if (e?.coord)
      this._arrived.push(e.coord)
    this.schedule()
  }

  constructor(map: TerrainMap) {
    this._map = map
    this._grid = buildTerrainGrid(PATCH_RESOLUTION)
    const doc = map._container.ownerDocument ?? document
    this._canvas = doc.createElement('canvas')
    this._canvas.className = 'tsmap-terrain'
    // In the map pane over the tiles (200) and the sky (300), under the
    // buildings (320), labels (350) and everything above them. Where no
    // ground is drawn it is clear, and the sky shows through.
    Object.assign(this._canvas.style, { position: 'absolute', left: '0', top: '0', zIndex: '310', pointerEvents: 'none', display: 'none' })
    try {
      const attrs = { alpha: true, premultipliedAlpha: true, antialias: true, depth: true }
      const gl2 = this._canvas.getContext('webgl2', attrs) as WebGLRenderingContext | null
      this._gl2 = !!gl2
      this._gl = gl2 ?? (this._canvas.getContext('webgl', attrs) as WebGLRenderingContext | null)
    }
    catch {
      this._gl = null
    }
    if (!this._gl || !this._init(this._gl)) {
      this._gl = null
      return
    }
    const parent = map._mapPane ?? map._container
    parent.appendChild(this._canvas)
    map.on('move zoom rotate pitch resize viewreset moveend zoomend', this._onChange)
    map.on('styledata layeradd layerremove', this._onLayer)
    map.on('terrainload', this._onDem)
    for (const layer of Object.values(map._layers))
      this._watch(layer)
    this.schedule()
  }

  /** Whether this browser draws terrain: WebGL, and shaders that built. */
  get ready(): boolean {
    return !!this._gl
  }

  /** Whether the terrain is drawn now. The globe, when it shows, wins. */
  active(): boolean {
    return this.ready && !!this._map._terrain && !!this._map._terrainSource && !this._map._globeActive()
  }

  _init(gl: WebGLRenderingContext): boolean {
    const tile = compile(gl, TILE_VERTEX, TILE_FRAGMENT, ['a_pos'])
    const mesh = compile(gl, MESH_VERTEX, MESH_FRAGMENT, ['a_grid', 'a_height'])
    if (!tile || !mesh)
      return false
    this._tileProgram = tile
    this._meshProgram = mesh
    // Labels can do without being hidden behind mountains; the ground cannot.
    this._depthProgram = compile(gl, MESH_VERTEX, DEPTH_FRAGMENT, ['a_grid', 'a_height'])
    for (const name of ['u_quad', 'u_cam', 'u_h', 'u_screen', 'u_view', 'u_ref', 'u_scale', 'u_skirt', 'u_depth', 'u_far'])
      this._depthUniforms[name] = this._depthProgram ? gl.getUniformLocation(this._depthProgram, name) : null
    for (const name of ['u_quad', 'u_cam', 'u_h', 'u_screen', 'u_rect', 'u_tile', 'u_alpha'])
      this._tileUniforms[name] = gl.getUniformLocation(tile, name)
    for (const name of ['u_quad', 'u_cam', 'u_h', 'u_screen', 'u_view', 'u_rect', 'u_ref', 'u_scale', 'u_skirt', 'u_depth', 'u_image', 'u_ground', 'u_fog', 'u_fogColor'])
      this._meshUniforms[name] = gl.getUniformLocation(mesh, name)
    this._tileAttrib = gl.getAttribLocation(tile, 'a_pos')
    this._gridAttrib = gl.getAttribLocation(mesh, 'a_grid')
    this._heightAttrib = gl.getAttribLocation(mesh, 'a_height')

    this._quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    this._gridBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this._gridBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this._grid.vertices, gl.STATIC_DRAW)
    this._indexBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._grid.indices, gl.STATIC_DRAW)

    this._image = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this._image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    this._fbo = gl.createFramebuffer()

    // Tiles far off in a tilted view are drawn into the flat picture at a
    // slant; without anisotropic filtering they shimmer.
    const ext = gl.getExtension('EXT_texture_filter_anisotropic')
      ?? gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
    if (ext)
      this._anisotropy = { ext, max: Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) }
    return true
  }

  _watch(layer: unknown): void {
    if (!isTileHost(layer) || this._hosts.has(layer))
      return
    this._hosts.add(layer)
    layer.on('tileload', this._onTileLoad)
    layer.on('tileunload', this._onTileUnload)
    layer.on('repaint', this._onRepaint)
    // A tile asked for changes which tiles cover the view, and so the patches.
    layer.on('load tileloadstart', this._onChange)
  }

  _unwatch(host: TileHost): void {
    host.off('tileload', this._onTileLoad)
    host.off('tileunload', this._onTileUnload)
    host.off('repaint', this._onRepaint)
    host.off('load tileloadstart', this._onChange)
    this._hosts.delete(host)
  }

  schedule(): void {
    if (!this._gl || this._frame)
      return
    this._frame = requestAnimationFrame(() => {
      this._frame = 0
      this._render()
    })
  }

  // -------------------------------------------------------------------------
  // The camera and the ground, for this frame
  // -------------------------------------------------------------------------

  /**
   * The camera and the reference height as they are now. Asked for by every
   * label and marker, so it is worked out once per change of view or of the
   * DEM, not once per call.
   */
  frame(): Frame {
    const map = this._map
    const size = map.getSize()
    const zoom = map.getZoom()
    const origin = map.getPixelOrigin()
    const pos = map._getMapPanePos()
    const bearing = map._bearing ?? 0
    const pitch = map._pitch ?? 0
    const src = map._terrainSource
    const version = src?.version ?? 0
    const exaggeration = map._terrain?.exaggeration ?? 1
    const s = this._state
    if (s && s.zoom === zoom && s.ox === origin.x && s.oy === origin.y && s.px === pos.x && s.py === pos.y
      && s.w === size.x && s.h === size.y && s.bearing === bearing && s.pitch === pitch && s.source === src && s.version === version && s.exaggeration === exaggeration) {
      return s
    }

    const cam: TerrainCamera = {
      cx: size.x / 2 + pos.x,
      cy: size.y / 2 + pos.y,
      lx: size.x / 2,
      ly: size.y / 2,
      bearing,
      pitch,
      h: map._cameraGeometry().h,
    }
    const world = map.options.crs?.scale(zoom) ?? 256 * 2 ** zoom
    const spec = map._terrain ? map._style?.spec.sources?.[map._terrain.source] : undefined
    const top = Number.isFinite(spec?.maxzoom) ? spec.maxzoom as number : 22
    const demZoom = Math.max(0, Math.min(top, Math.round(zoom) + 1))
    const frame: Frame = { zoom, ox: origin.x, oy: origin.y, px: pos.x, py: pos.y, w: size.x, h: size.y, bearing, pitch, source: src, version, exaggeration, cam, world, demZoom, ref: this._lastRef }
    // The ground under the centre of the view, found on the flat map — which
    // is where the terrain puts it, the centre being at the reference height
    // by definition.
    const center = map.containerPointToLayerPoint({ x: size.x / 2, y: size.y / 2 })
    const ref = src?.sampleWorld((center.x + origin.x) / world, (center.y + origin.y) / world, demZoom)
    if (ref != null && Number.isFinite(ref))
      frame.ref = this._lastRef = ref
    this._state = frame
    return frame
  }

  /** How far, in pixels, the ground at a layer point stands off the flat map. */
  liftAt(x: number, y: number, frame: Frame = this.frame()): number {
    const src = this._map._terrainSource
    if (!src)
      return 0
    const fx = (x + frame.ox) / frame.world
    const fy = (y + frame.oy) / frame.world
    const metres = src.sampleWorld(fx, fy, frame.demZoom)
    if (metres == null)
      return 0
    return (metres - frame.ref) * frame.exaggeration * pixelsPerMetre(frame.world, fy)
  }

  /**
   * A layer point on the ground to container pixels: where the terrain draws
   * it. Behind the camera, nowhere on screen, as `_pitchPoint` has it.
   */
  project(x: number, y: number): { x: number, y: number } {
    const frame = this.frame()
    const p = projectTerrainPoint(frame.cam, x, y, this.liftAt(x, y, frame))
    if (p.depth <= frame.cam.h * 1e-3)
      return { x: x - frame.cam.lx < 0 ? -1e7 : 1e7, y: 1e7 }
    return { x: p.x, y: p.y }
  }

  /**
   * `VectorTileMapLayer._tileProjector` on terrain: tile pixels, at `k` layer
   * pixels each from `(ox, oy)`, to container pixels on the surface. Labels on
   * ground drawn at under a third of its size at the centre are left off, as
   * on the flat map.
   */
  tileProjector(ox: number, oy: number, k: number): (x: number, y: number) => { x: number, y: number } | null {
    const frame = this.frame()
    const cam = frame.cam
    const depth = this._depthMap(frame)
    return (x, y) => {
      const lx = x * k + ox
      const ly = y * k + oy
      const p = projectTerrainPoint(cam, lx, ly, this.liftAt(lx, ly, frame))
      if (p.depth <= 0 || cam.h / p.depth < 1 / 3)
        return null
      if (depth && hidden(depth, p.x, p.y, p.depth))
        return null
      return { x: p.x, y: p.y }
    }
  }

  /**
   * The layer point of the ground under a container point: the ray through
   * that pixel, cast down onto the surface. Walks down the ray from the top
   * of the highest ground drawn to the bottom of the lowest, and narrows in
   * on the first place it goes under; the nearest slope wins, as it hides
   * whatever is behind. Where it meets no ground, the flat map's answer.
   */
  pick(sx: number, sy: number): { x: number, y: number } {
    const frame = this.frame()
    const cam = frame.cam
    const flat = (): { x: number, y: number } => unprojectTerrainPoint(cam, sx, sy, 0) ?? this._map.containerPointToLayerPoint({ x: sx, y: sy })
    const range = this._range
    if (!range)
      return flat()
    const scale = frame.exaggeration * pixelsPerMetre(frame.world, (cam.ly + frame.oy) / frame.world)
    let hi = (range.max - frame.ref) * scale + 1
    const lo = (range.min - frame.ref) * scale - 1
    if (!(hi > lo))
      return flat()
    // Never start above the camera.
    hi = Math.min(hi, cam.h * Math.cos(cam.pitch * DEG) * 0.99)
    const steps = 64
    let prev: number | null = null
    for (let i = 0; i <= steps; i++) {
      const lift = hi + (lo - hi) * i / steps
      const p = unprojectTerrainPoint(cam, sx, sy, lift)
      if (!p)
        continue
      if (this.liftAt(p.x, p.y, frame) >= lift) {
        if (prev === null)
          return p
        // Between the last level above the ground and this one below it.
        let above = prev
        let below = lift
        let hit = p
        for (let j = 0; j < 16; j++) {
          const mid = (above + below) / 2
          const q = unprojectTerrainPoint(cam, sx, sy, mid)
          if (!q)
            break
          if (this.liftAt(q.x, q.y, frame) >= mid) {
            below = mid
            hit = q
          }
          else {
            above = mid
          }
        }
        return hit
      }
      prev = lift
    }
    return flat()
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  /** The tile layers on the map, bottom first. */
  _layers(): TileHost[] {
    const pane = this._map.getPane('tilePane')
    const order = pane ? Array.from(pane.children) : []
    const live = new Set(Object.values(this._map._layers))
    for (const host of this._hosts) {
      if (!live.has(host))
        this._unwatch(host)
    }
    return [...this._hosts].sort((a, b) => order.indexOf(a._container as Element) - order.indexOf(b._container as Element))
  }

  /** Show or hide the terrain, and the flat tiles it stands in for. */
  _show(shown: boolean): void {
    this._canvas.style.display = shown ? 'block' : 'none'
    const pane = this._map.getPane('tilePane')
    // Re-asserted every frame: the globe writes this pane's opacity too, and
    // terrain only draws when the globe does not.
    if (pane && (shown || this._shown))
      pane.style.opacity = shown ? '0' : ''
    if (shown !== this._shown) {
      this._shown = shown
      this._placed.version = -1
    }
  }

  _dropTexture(el: HTMLElement): void {
    const entry = this._textures.get(el)
    if (!entry)
      return
    this._gl?.deleteTexture(entry.tex)
    this._textures.delete(el)
  }

  _texture(gl: WebGLRenderingContext, el: HTMLCanvasElement | HTMLImageElement): WebGLTexture | null {
    let entry = this._textures.get(el)
    if (entry && !entry.dirty)
      return entry.tex
    if (!entry) {
      const tex = gl.createTexture()
      if (!tex)
        return null
      entry = { tex, dirty: true }
      this._textures.set(el, entry)
    }
    gl.bindTexture(gl.TEXTURE_2D, entry.tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el)
    }
    catch {
      return null
    }
    const w = el instanceof HTMLImageElement ? el.naturalWidth : el.width
    const h = el instanceof HTMLImageElement ? el.naturalHeight : el.height
    const pot = (w & (w - 1)) === 0 && (h & (h - 1)) === 0
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    // Mipmaps, so tiles far off and small are averaged, not sampled.
    if (this._gl2 || pot) {
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    }
    else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    }
    if (this._anisotropy)
      gl.texParameterf(gl.TEXTURE_2D, this._anisotropy.ext.TEXTURE_MAX_ANISOTROPY_EXT, this._anisotropy.max)
    entry.dirty = false
    return entry.tex
  }

  /**
   * The ground patches to draw: one per tile of the tile layer covering the
   * most of the view, on the 256 px grid. That layer's tiles already follow
   * the view — small near the camera, large towards the horizon — and never
   * overlap, so neither do the patches.
   */
  _patchCoords(layers: TileHost[]): Array<{ z: number, x: number, y: number }> {
    let best: Array<{ z: number, x: number, y: number }> = []
    let bestCover = 0
    for (const layer of layers) {
      const levels = Math.log2(layer.getTileSize().x / 256)
      if (!Number.isInteger(levels))
        continue
      const tiles = Object.values(layer._tiles ?? {})
      const current = tiles.filter(t => t.current)
      const coords = (current.length ? current : tiles).map(t => ({ z: t.coords.z - levels, x: t.coords.x, y: t.coords.y })).filter(c => c.z >= 0)
      const cover = coords.reduce((sum, c) => sum + 4 ** -c.z, 0)
      if (cover > bestCover) {
        best = coords
        bestCover = cover
      }
    }
    // Mid-update a layer can hold a tile and its children at once. Two
    // patches over the same ground would fight for it, so the coarser one
    // stands for both until the layer settles.
    const keys = new Set(best.map(c => `${c.z}/${c.x}/${c.y}`))
    return best.filter((c) => {
      for (let z = c.z - 1; z >= 0; z--) {
        const f = 2 ** (c.z - z)
        if (keys.has(`${z}/${Math.floor(c.x / f)}/${Math.floor(c.y / f)}`))
          return false
      }
      return true
    })
  }

  /**
   * Ask for the DEM tiles a patch reads, at one level finer than the patch,
   * and for one tile four levels up. That one covers the patch and its
   * neighbours at once and arrives first, so the ground rises roughly all
   * together and then sharpens, rather than patch by patch.
   */
  _requestDem(c: { z: number, x: number, y: number }, demZoom: number): void {
    const map = this._map
    const src = map._terrainSource
    if (!src)
      return
    const want = Math.min(demZoom, c.z + 1)
    const ask = (coord: { z: number, x: number, y: number }): void => {
      if (!src.hasTile(coord) && !map._terrainMissing?.has(`${coord.z}/${coord.x}/${coord.y}`))
        map._maybeFetchTerrainTile(coord)
    }
    const rough = Math.max(0, want - 4)
    ask({ z: rough, x: Math.floor(c.x / 2 ** (c.z - rough)), y: Math.floor(c.y / 2 ** (c.z - rough)) })
    if (want <= c.z) {
      const f = 2 ** (c.z - want)
      ask({ z: want, x: Math.floor(c.x / f), y: Math.floor(c.y / f) })
      return
    }
    const f = 2 ** (want - c.z)
    for (let dy = 0; dy < f; dy++) {
      for (let dx = 0; dx < f; dx++)
        ask({ z: want, x: c.x * f + dx, y: c.y * f + dy })
    }
  }

  /**
   * A patch's heights, read from the DEM once and kept until it changes.
   *
   * Read no finer than the DEM the patch asks for (`_requestDem`): a far
   * patch then reads one tile, not a walk up the pyramid from tiles that were
   * never asked for, and keeps its heights as the zoom changes.
   */
  _patch(gl: WebGLRenderingContext, c: { z: number, x: number, y: number }, viewDemZoom: number): Patch | null {
    const demZoom = Math.min(viewDemZoom, c.z + 1)
    const key = `${c.z}/${c.x}/${c.y}/${demZoom}`
    const known = this._patches.get(key)
    if (known)
      return known
    const src = this._map._terrainSource
    const buffer = gl.createBuffer()
    if (!src || !buffer)
      return null
    const grid = this._grid
    const side = grid.side
    const n = side - 1
    const scale = 2 ** c.z
    const heights = new Float32Array(side * side)
    let min = Infinity
    let max = -Infinity
    for (let j = 0; j < side; j++) {
      const fy = (c.y + j / n) / scale
      for (let i = 0; i < side; i++) {
        const metres = src.sampleWorld((c.x + i / n) / scale, fy, demZoom)
        if (metres == null || !Number.isFinite(metres)) {
          heights[j * side + i] = NO_DATA
          continue
        }
        heights[j * side + i] = metres
        min = Math.min(min, metres)
        max = Math.max(max, metres)
      }
    }
    const data = new Float32Array(grid.vertexCount)
    for (let v = 0; v < grid.vertexCount; v++)
      data[v] = heights[grid.heightIndex[v]!]!
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    const patch: Patch = { key, ...c, demZoom, buffer, min, max }
    this._patches.set(key, patch)
    return patch
  }

  /** Forget the heights of patches a newly arrived DEM tile covers. */
  _invalidateHeights(gl: WebGLRenderingContext): void {
    const src = this._map._terrainSource
    const version = src?.version ?? 0
    if (src === this._heightsSource && version === this._heightsVersion && !this._arrived.length)
      return
    // Another DEM altogether: nothing read from the last one holds.
    const arrived = src === this._heightsSource ? this._arrived : []
    this._arrived = []
    this._heightsSource = src
    for (const [key, patch] of this._patches) {
      const s = 2 ** -patch.z
      const px0 = patch.x * s
      const py0 = patch.y * s
      // Every tile came and went unannounced (a manual `addTerrainTile`
      // without an event, a cleared cache): all of them read again.
      const touched = !arrived.length || arrived.some((a) => {
        const t = 2 ** -a.z
        return a.x * t < px0 + s && (a.x + 1) * t > px0 && a.y * t < py0 + s && (a.y + 1) * t > py0
      })
      if (touched) {
        gl.deleteBuffer(patch.buffer)
        this._patches.delete(key)
      }
    }
    this._heightsVersion = version
  }

  /** The flat map's own picture of every loaded tile, into `_image`. */
  _drawFlat(gl: WebGLRenderingContext, layers: TileHost[], frame: Frame, rect: { x: number, y: number, w: number, h: number }, ratio: number): boolean {
    const limit = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)
    const scale = Math.min(ratio, limit / rect.w, limit / rect.h)
    const w = Math.max(1, Math.round(rect.w * scale))
    const h = Math.max(1, Math.round(rect.h * scale))
    gl.bindTexture(gl.TEXTURE_2D, this._image)
    if (this._imageSize.w !== w || this._imageSize.h !== h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      this._imageSize = { w, h }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._image, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return false
    }
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const u = this._tileUniforms
    const cam = frame.cam
    gl.useProgram(this._tileProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad)
    gl.enableVertexAttribArray(this._tileAttrib)
    gl.vertexAttribPointer(this._tileAttrib, 2, gl.FLOAT, false, 0, 0)
    this._cameraUniforms(gl, u, cam)
    gl.uniform4f(u.u_rect, rect.x, rect.y, rect.w, rect.h)
    gl.uniform1i(u.u_tile, 0)
    gl.activeTexture(gl.TEXTURE0)

    let fading = false
    const seen = new Set<HTMLElement>()
    for (const layer of layers) {
      const T = layer.getTileSize().x
      const opacity = layer.options?.opacity ?? 1
      const tz = layer._tileZoom ?? 0
      // Furthest level from the current one first, as the tile pane stacks
      // them: a coarse tile standing in for finer ones is drawn under them.
      const tiles = Object.values(layer._tiles ?? {})
        .filter(t => t.loaded && drawable(t.el))
        .sort((a, b) => Math.abs(b.coords.z - tz) - Math.abs(a.coords.z - tz))
      for (const t of tiles) {
        seen.add(t.el)
        const tex = this._texture(gl, t.el as HTMLCanvasElement | HTMLImageElement)
        if (!tex)
          continue
        const fade = t.el.style?.opacity ? Number(t.el.style.opacity) : 1
        if (fade < 1)
          fading = true
        const k = this._map.getZoomScale(frame.zoom, t.coords.z)
        gl.uniform3f(u.u_quad, t.coords.x * T * k - frame.ox - cam.lx, t.coords.y * T * k - frame.oy - cam.ly, T * k)
        gl.uniform1f(u.u_alpha, opacity * (Number.isFinite(fade) ? fade : 1))
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
    }
    gl.disableVertexAttribArray(this._tileAttrib)
    for (const el of [...this._textures.keys()]) {
      if (!seen.has(el))
        this._dropTexture(el)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return fading
  }

  _cameraUniforms(gl: WebGLRenderingContext, u: Record<string, WebGLUniformLocation | null>, cam: TerrainCamera): void {
    const b = -cam.bearing * DEG
    const t = cam.pitch * DEG
    gl.uniform4f(u.u_cam, Math.cos(b), Math.sin(b), Math.sin(t), Math.cos(t))
    gl.uniform1f(u.u_h, cam.h)
    gl.uniform2f(u.u_screen, cam.cx, cam.cy)
  }

  /**
   * The near and far planes, from the patches' corners at their lowest: as
   * close as the depth buffer can resolve, out to the furthest ground.
   */
  _planes(frame: Frame, patches: Patch[]): { near: number, far: number } {
    const cam = frame.cam
    const st = Math.sin(cam.pitch * DEG)
    const ct = Math.cos(cam.pitch * DEG)
    const b = -cam.bearing * DEG
    let lowest = Infinity
    for (const p of patches)
      lowest = Math.min(lowest, p.min)
    if (!Number.isFinite(lowest))
      lowest = frame.ref
    let far = cam.h
    for (const p of patches) {
      const k = this._map.getZoomScale(frame.zoom, p.z)
      const size = 256 * k
      const x0 = p.x * 256 * k - frame.ox
      const y0 = p.y * 256 * k - frame.oy
      const lift = (lowest - frame.ref) * frame.exaggeration * pixelsPerMetre(frame.world, (p.y + 0.5) / 2 ** p.z) - skirt(size)
      for (const [x, y] of [[x0, y0], [x0 + size, y0], [x0, y0 + size], [x0 + size, y0 + size]] as const) {
        const ry = (x - cam.lx) * Math.sin(b) + (y - cam.ly) * Math.cos(b)
        far = Math.max(far, cam.h - ry * st - lift * ct)
      }
    }
    far *= 1.05
    return { near: Math.max(cam.h / 50, far / 1e5), far }
  }

  /** The patches through the mesh vertex shader, with `program`'s uniforms `u` in use. */
  _drawPatches(gl: WebGLRenderingContext, u: Record<string, WebGLUniformLocation | null>, frame: Frame, patches: Patch[], near: number, far: number): void {
    const cam = frame.cam
    this._cameraUniforms(gl, u, cam)
    gl.uniform2f(u.u_view, frame.w, frame.h)
    gl.uniform1f(u.u_ref, frame.ref)
    gl.uniform2f(u.u_depth, near, far)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._gridBuffer)
    gl.enableVertexAttribArray(this._gridAttrib)
    gl.vertexAttribPointer(this._gridAttrib, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer)
    gl.enableVertexAttribArray(this._heightAttrib)
    for (const p of patches) {
      const k = this._map.getZoomScale(frame.zoom, p.z)
      const size = 256 * k
      gl.uniform3f(u.u_quad, p.x * 256 * k - frame.ox - cam.lx, p.y * 256 * k - frame.oy - cam.ly, size)
      gl.uniform1f(u.u_scale, frame.exaggeration * pixelsPerMetre(frame.world, (p.y + 0.5) / 2 ** p.z))
      gl.uniform1f(u.u_skirt, skirt(size))
      gl.bindBuffer(gl.ARRAY_BUFFER, p.buffer)
      gl.vertexAttribPointer(this._heightAttrib, 1, gl.FLOAT, false, 0, 0)
      gl.drawElements(gl.TRIANGLES, this._grid.indexCount, gl.UNSIGNED_SHORT, 0)
    }
    gl.disableVertexAttribArray(this._gridAttrib)
    gl.disableVertexAttribArray(this._heightAttrib)
  }

  /**
   * How far the surface is from the camera at each point of the screen, at a
   * quarter of its resolution, for hiding labels behind mountains. Drawn when
   * a label first asks in a frame, read back once, then looked up per point.
   */
  _depthMap(frame: Frame): DepthMap | null {
    const gl = this._gl
    const patches = this._drawn
    if (!gl || !this._depthProgram || !patches.length)
      return null
    const cached = this._depth
    if (cached && cached.frame === frame && cached.patches === patches)
      return cached
    const w = Math.max(1, Math.ceil(frame.w / DEPTH_SCALE))
    const h = Math.max(1, Math.ceil(frame.h / DEPTH_SCALE))
    if (!this._depthTarget || this._depthTarget.w !== w || this._depthTarget.h !== h) {
      const target = this._depthTarget ?? { fbo: gl.createFramebuffer(), tex: gl.createTexture(), depth: gl.createRenderbuffer(), w, h }
      target.w = w
      target.h = h
      gl.bindTexture(gl.TEXTURE_2D, target.tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.bindRenderbuffer(gl.RENDERBUFFER, target.depth)
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h)
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.tex, 0)
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, target.depth)
      this._depthTarget = target
    }
    const target = this._depthTarget
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return null
    }
    const { near, far } = this._planes(frame, patches)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clearDepth(1)
    gl.depthMask(true)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.disable(gl.BLEND)
    gl.useProgram(this._depthProgram)
    gl.uniform1f(this._depthUniforms.u_far, far)
    this._drawPatches(gl, this._depthUniforms, frame, patches, near, far)
    const data = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this._depth = { frame, patches, w, h, far, data }
    return this._depth
  }

  _render(): void {
    const gl = this._gl
    const map = this._map
    if (!gl)
      return
    if (!this.active()) {
      this._show(false)
      this._placeUpright()
      return
    }
    this._show(true)

    const frame = this.frame()
    const cam = frame.cam
    const W = frame.w
    const H = frame.h
    const canvas = this._canvas
    // The map pane moves with a flat drag; the canvas stays over the view.
    canvas.style.transform = `translate3d(${-frame.px}px, ${-frame.py}px, 0)`
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1)
    const width = Math.max(1, Math.round(W * ratio))
    const height = Math.max(1, Math.round(H * ratio))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    const layers = this._layers()
    // The flat picture reaches past the view: ground standing up from below
    // its bottom edge, or sinking from above its top, comes into view.
    const rect = { x: -W * MARGIN, y: -H * MARGIN, w: W * (1 + 2 * MARGIN), h: H * (1 + 2 * MARGIN) }
    const fading = this._drawFlat(gl, layers, frame, rect, ratio)

    this._invalidateHeights(gl)
    const patches: Patch[] = []
    const used = new Set<string>()
    let min = Infinity
    let max = -Infinity
    for (const c of this._patchCoords(layers)) {
      this._requestDem(c, frame.demZoom)
      const patch = this._patch(gl, c, frame.demZoom)
      if (!patch)
        continue
      patches.push(patch)
      used.add(patch.key)
      min = Math.min(min, patch.min)
      max = Math.max(max, patch.max)
    }
    for (const [key, patch] of this._patches) {
      if (!used.has(key)) {
        gl.deleteBuffer(patch.buffer)
        this._patches.delete(key)
      }
    }
    this._range = Number.isFinite(min) ? { min, max } : null

    const { near, far } = this._planes(frame, patches)
    this._drawn = patches

    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clearDepth(1)
    gl.depthMask(true)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.disable(gl.BLEND)

    const u = this._meshUniforms
    gl.useProgram(this._meshProgram)
    gl.uniform4f(u.u_rect, rect.x, rect.y, rect.w, rect.h)
    gl.uniform1i(u.u_image, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._image)

    const dark = map._container.classList.contains('tsmap-dark')
    const ground = this._color(getComputedStyle(map._container).backgroundColor, dark ? '#1c2026' : '#eef0f2')
    gl.uniform3f(u.u_ground, ground[0], ground[1], ground[2])
    // The sky's haze, where the flat map has it (`_updateAtmosphereOverlay`).
    const horizon = H / 2 - map._horizonDistance()
    if (horizon > 0) {
      const fog = this._color(map._sky?.['horizon-color'] ?? (map._sky ? '#ffffff' : dark ? '#1f2837' : '#eef3f7'), '#eef3f7')
      gl.uniform4f(u.u_fog, horizon + frame.py, Math.max(16, H * 0.08), rect.y, rect.h)
      gl.uniform3f(u.u_fogColor, fog[0], fog[1], fog[2])
    }
    else {
      gl.uniform4f(u.u_fog, 0, 0, rect.y, rect.h)
    }

    this._drawPatches(gl, u, frame, patches, near, far)

    this._placeUpright()
    // Tiles fading in change the picture with no event to say so.
    if (fading)
      this.schedule()
  }

  /**
   * Put the markers, popups and labels where the ground now is, when the
   * ground moved under them without the camera moving: a DEM tile arrived,
   * the exaggeration changed, terrain came on or off, or the reference height
   * changed with a flat drag, which moves the pane rather than firing the
   * events those panes follow.
   */
  _placeUpright(): void {
    const on = this.active()
    const frame = on ? this.frame() : null
    const ref = frame ? frame.ref : Number.NaN
    const version = on ? (this._map._terrainSource?.version ?? 0) : -2
    const exaggeration = frame ? frame.exaggeration : Number.NaN
    const placed = this._placed
    const same = (a: number, b: number): boolean => a === b || (Number.isNaN(a) && Number.isNaN(b))
    if (placed.version === version && same(placed.ref, ref) && same(placed.exaggeration, exaggeration))
      return
    this._placed = { ref, version, exaggeration }
    for (const layer of Object.values(this._map._layers) as any[]) {
      if (layer?._icon && typeof layer.update === 'function')
        layer.update()
      else if (layer?._container && typeof layer._updatePosition === 'function')
        layer._updatePosition()
      layer?._symbolOverlay?.schedule?.()
    }
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
      rgb = [r! / 255, g! / 255, b! / 255]
    }
    this._colors.set(value, rgb)
    return rgb
  }

  remove(): void {
    if (this._frame)
      cancelAnimationFrame(this._frame)
    this._frame = 0
    if (this._gl)
      this._show(false)
    this._map.off('move zoom rotate pitch resize viewreset moveend zoomend', this._onChange)
    this._map.off('styledata layeradd layerremove', this._onLayer)
    this._map.off('terrainload', this._onDem)
    for (const host of [...this._hosts])
      this._unwatch(host)
    this._canvas.remove()
    const lose = this._gl?.getExtension('WEBGL_lose_context')
    lose?.loseContext()
    this._gl = null
    this._textures.clear()
    this._patches.clear()
    // Back where the flat map puts them.
    this._placeUpright()
  }
}
