import { earcut } from '../../geometry/earcut'

/**
 * 3D buildings, drawn the way Apple Maps draws them: real boxes seen through
 * the map's own camera, lit from one side, standing up off the ground as the
 * map tilts.
 *
 * `fill-extrusion` used to be drawn into each tile's own canvas — flat in
 * Canvas2D, and through an orthographic camera in WebGL. Either way the
 * result was a picture on the ground: tilt the map and the tile tilts with
 * the building painted on it. Real depth needs the real camera, so buildings
 * are drawn here instead, into one viewport-sized WebGL canvas above the
 * tiles and under the labels, with a projection that is — term for term — the
 * one `latLngToContainerPoint` uses, so a building's footprint sits exactly on
 * the ground it came from.
 *
 * Geometry is built once per tile (see `buildBuildingMesh`) and uploaded once;
 * a frame is a matrix per tile and a draw call.
 */

export interface BuildingFootprint {
  /** Rings in the tile's own pixels, as the tile draws them. */
  rings: Array<Array<{ x: number, y: number }>>
  /** Metres. */
  height: number
  /** Metres. */
  base: number
  /** 0–1 components. */
  color: [number, number, number, number]
}

/**
 * Bytes per vertex. Position and height are floats; the rest fits in bytes —
 * the wall normal (roofs have none), how far up the wall the vertex is, and
 * the colour — which keeps a downtown's worth of buildings to a fifth of the
 * memory eleven floats a vertex took.
 *
 *   0  x (f32)   4  y (f32)   8  height, metres (f32)
 *   12 nx (i8)   13 ny (i8)   14 t: 0 foot, 255 top (u8)
 *   16 r, g, b, a (u8)
 */
export const BUILDING_STRIDE = 20

/** A tile's building geometry, ready to upload. */
export interface BuildingMesh {
  data: ArrayBuffer
  /** Vertices, three per triangle. */
  count: number
}

/** Read one vertex back out of a mesh, for tests and debugging. */
export function readBuildingVertex(mesh: BuildingMesh, i: number): { x: number, y: number, height: number, nx: number, ny: number, t: number, color: [number, number, number, number] } {
  const view = new DataView(mesh.data, i * BUILDING_STRIDE, BUILDING_STRIDE)
  return {
    x: view.getFloat32(0, true),
    y: view.getFloat32(4, true),
    height: view.getFloat32(8, true),
    nx: view.getInt8(12) / 127,
    ny: view.getInt8(13) / 127,
    t: view.getUint8(14) / 255,
    color: [view.getUint8(16) / 255, view.getUint8(17) / 255, view.getUint8(18) / 255, view.getUint8(19) / 255],
  }
}

/**
 * Triangles for a tile's buildings: a roof per polygon and a wall per edge.
 *
 * Rings are grouped into polygons by winding — each outer ring and the holes
 * after it — so a courtyard stays open and a multipolygon does not fuse into
 * one slab. Wall normals come from the edge direction; with spec-conforming
 * winding that faces them outwards from the building, holes included.
 *
 * Walls along the tile's own clipping are left out. A building crossing the
 * tile edge is cut there, and the cut would otherwise show as a wall standing
 * in the middle of the building, drawn over its neighbour tile's half.
 */
export function buildBuildingMesh(buildings: BuildingFootprint[], tileSize: number): BuildingMesh {
  // Written straight into the packed layout, growing as needed: a dense
  // downtown tile is a couple of hundred thousand vertices, and going through
  // an array of numbers first more than doubled the time to build it.
  let points = 0
  for (const building of buildings) {
    for (const ring of building.rings)
      points += ring.length
  }
  const out = new MeshWriter(Math.max(64, points * 9))

  const outside = (a: { x: number, y: number }, b: { x: number, y: number }): boolean =>
    (a.x <= 0 && b.x <= 0) || (a.y <= 0 && b.y <= 0) || (a.x >= tileSize && b.x >= tileSize) || (a.y >= tileSize && b.y >= tileSize)

  for (const building of buildings) {
    if (!(building.height > building.base))
      continue
    out.color(building.color)
    const top = building.height
    const bottom = building.base

    // Group rings into polygons: an outer ring, then its holes.
    const polygons: Array<Array<Array<{ x: number, y: number }>>> = []
    let outerSign = 0
    for (const ring of building.rings) {
      if (ring.length < 3)
        continue
      const area = ringArea(ring)
      if (area === 0)
        continue
      const sign = Math.sign(area)
      if (outerSign === 0)
        outerSign = sign
      if (sign === outerSign || polygons.length === 0)
        polygons.push([ring])
      else
        polygons[polygons.length - 1]!.push(ring)
    }

    for (const polygon of polygons) {
      // --- Roof ---
      const flat: number[] = []
      const holes: number[] = []
      for (let i = 0; i < polygon.length; i++) {
        if (i > 0)
          holes.push(flat.length / 2)
        for (const p of polygon[i]!)
          flat.push(p.x, p.y)
      }
      const indices = earcut(flat, holes, 2)
      for (const index of indices)
        out.vertex(flat[index * 2]!, flat[index * 2 + 1]!, top, 0, 0, 255)

      // --- Walls ---
      // Winding decides which side is outside; data wound the other way round
      // from the spec is flipped whole, so it still lights the right way.
      const flip = outerSign < 0 ? -127 : 127
      for (const ring of polygon) {
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i]!
          const q = ring[(i + 1) % ring.length]!
          const dx = q.x - p.x
          const dy = q.y - p.y
          const length = Math.hypot(dx, dy)
          if (length === 0 || outside(p, q))
            continue
          const nx = Math.round((dy / length) * flip)
          const ny = Math.round((-dx / length) * flip)
          out.vertex(p.x, p.y, bottom, nx, ny, 0)
          out.vertex(q.x, q.y, bottom, nx, ny, 0)
          out.vertex(q.x, q.y, top, nx, ny, 255)
          out.vertex(p.x, p.y, bottom, nx, ny, 0)
          out.vertex(q.x, q.y, top, nx, ny, 255)
          out.vertex(p.x, p.y, top, nx, ny, 255)
        }
      }
    }
  }
  return out.finish()
}

/** Appends vertices in `BUILDING_STRIDE` layout, doubling its buffer when full. */
class MeshWriter {
  count = 0
  buffer: ArrayBuffer
  f32: Float32Array
  i8: Int8Array
  u8: Uint8Array
  rgba: [number, number, number, number] = [0, 0, 0, 255]

  constructor(capacity: number) {
    this.buffer = new ArrayBuffer(capacity * BUILDING_STRIDE)
    this.f32 = new Float32Array(this.buffer)
    this.i8 = new Int8Array(this.buffer)
    this.u8 = new Uint8Array(this.buffer)
  }

  color(c: [number, number, number, number]): void {
    const byte = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)))
    this.rgba = [byte(c[0]), byte(c[1]), byte(c[2]), byte(c[3])]
  }

  vertex(x: number, y: number, h: number, nx: number, ny: number, t: number): void {
    if ((this.count + 1) * BUILDING_STRIDE > this.buffer.byteLength) {
      const grown = new ArrayBuffer(this.buffer.byteLength * 2)
      new Uint8Array(grown).set(this.u8)
      this.buffer = grown
      this.f32 = new Float32Array(grown)
      this.i8 = new Int8Array(grown)
      this.u8 = new Uint8Array(grown)
    }
    const o = this.count * BUILDING_STRIDE
    const f = o >> 2
    this.f32[f] = x
    this.f32[f + 1] = y
    this.f32[f + 2] = h
    this.i8[o + 12] = nx
    this.i8[o + 13] = ny
    this.u8[o + 14] = t
    this.u8[o + 16] = this.rgba[0]
    this.u8[o + 17] = this.rgba[1]
    this.u8[o + 18] = this.rgba[2]
    this.u8[o + 19] = this.rgba[3]
    this.count++
  }

  finish(): BuildingMesh {
    return { data: this.buffer.slice(0, this.count * BUILDING_STRIDE), count: this.count }
  }
}

function ringArea(ring: Array<{ x: number, y: number }>): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    sum += ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y
  return sum / 2
}

export interface BuildingCamera {
  /** Viewport size in CSS pixels. */
  width: number
  height: number
  /** Degrees. */
  bearing: number
  pitch: number
  /** Camera height above the ground in pixels (`TsMap._cameraGeometry().h`). */
  h: number
  /** Map pane offset, CSS pixels. */
  pos: [number, number]
}

/**
 * The matrix taking a tile's own pixels (and a height in pixels) to clip
 * space, for the camera the map is using right now.
 *
 * Built from the same steps as `layerPointToContainerPoint`: tile pixels to
 * layer pixels, about the view centre, turned by the bearing, tilted by the
 * pitch — `rotateX`, with height rising towards the camera — and projected
 * through a camera `h` pixels above the ground. The pane offset is a shift of
 * the finished picture.
 *
 * `scale` and `origin` are the tile's layer-pixel placement: layer =
 * tile·scale + origin. They are computed in double precision by the caller;
 * world pixels at street zoom run to eight digits, which a GPU's float would
 * round to the nearest pixel or two.
 */
export function buildingMatrix(camera: BuildingCamera, scale: number, origin: [number, number]): Float32Array {
  const { width: W, height: H, h } = camera
  // The map turns counter-clockwise by its bearing.
  const b = (-camera.bearing * Math.PI) / 180
  const t = (camera.pitch * Math.PI) / 180
  const cb = Math.cos(b)
  const sb = Math.sin(b)
  const ct = Math.cos(t)
  const st = Math.sin(t)
  const cx = W / 2
  const cy = H / 2

  // Tile → centred layer pixels: x' = s·x + ox − cx.
  const ox = origin[0] - cx
  const oy = origin[1] - cy

  // Rows of the affine part up to the camera: [x_cam, y_cam, z_cam] as a
  // function of (x, y, z) in tile pixels / height pixels.
  // Bearing: X = x'·cb − y'·sb, Y = x'·sb + y'·cb, Z = z.
  // Pitch (rotateX): y'' = Y·ct − Z·st, z'' = Y·st + Z·ct; camera at z = h.
  const r00 = scale * cb
  const r01 = -scale * sb
  const r0t = ox * cb - oy * sb
  const r10 = scale * sb
  const r11 = scale * cb
  const r1t = ox * sb + oy * cb

  // x_cam
  const xx = r00
  const xy = r01
  const xz = 0
  const xw = r0t
  // y_cam = Y·ct − z·st
  const yx = r10 * ct
  const yy = r11 * ct
  const yz = -st
  const yw = r1t * ct
  // z_cam = Y·st + z·ct − h
  const zx = r10 * st
  const zy = r11 * st
  const zz = ct
  const zw = r1t * st - h

  // Perspective: x_clip = x_cam·2h/W, y_clip = −y_cam·2h/H (screen y is
  // down), w = −z_cam. Depth over [near, far] in camera distance.
  const near = h * 0.05
  const far = h * 400
  const A = -(far + near) / (far - near)
  const B = (-2 * far * near) / (far - near)
  const px = (2 * h) / W
  const py = (-2 * h) / H
  // The pane offset shifts the picture: add it in NDC, scaled by w.
  const tx = (2 * camera.pos[0]) / W
  const ty = (-2 * camera.pos[1]) / H

  // Clip rows.
  const row = (a: number, c: number, d: number, e: number): [number, number, number, number] => [a, c, d, e]
  const wRow = row(-zx, -zy, -zz, -zw)
  const xRow = row(xx * px + wRow[0] * tx, xy * px + wRow[1] * tx, xz * px + wRow[2] * tx, xw * px + wRow[3] * tx)
  const yRow = row(yx * py + wRow[0] * ty, yy * py + wRow[1] * ty, yz * py + wRow[2] * ty, yw * py + wRow[3] * ty)
  const zRow = row(zx * A, zy * A, zz * A, zw * A + B)

  // Column-major for WebGL.
  return new Float32Array([
    xRow[0], yRow[0], zRow[0], wRow[0],
    xRow[1], yRow[1], zRow[1], wRow[1],
    xRow[2], yRow[2], zRow[2], wRow[2],
    xRow[3], yRow[3], zRow[3], wRow[3],
  ])
}

const VERTEX = `
attribute vec3 a_pos;
attribute vec2 a_normal;
attribute vec4 a_color;
attribute float a_t;
uniform mat4 u_matrix;
uniform float u_heightScale;
uniform vec2 u_light;
uniform float u_opacity;
uniform vec2 u_fog;
varying vec4 v_color;
void main() {
  vec4 clip = u_matrix * vec4(a_pos.xy, a_pos.z * u_heightScale, 1.0);
  gl_Position = clip;
  // Roofs are lifted a little above the base colour; walls are shaded by
  // how squarely they face the light, and darken towards their foot, which
  // is what makes a block of similar buildings read as separate boxes.
  vec3 rgb = a_color.rgb;
  float shade = 1.0;
  if (dot(a_normal, a_normal) < 0.25)
    rgb = mix(rgb, vec3(1.0), 0.18);
  else
    shade = (0.66 + 0.24 * (0.5 + 0.5 * dot(normalize(a_normal), u_light))) * mix(0.84, 1.0, a_t);
  // Distant buildings fade into the haze at the horizon.
  float fog = 1.0 - smoothstep(u_fog.x, u_fog.y, clip.w);
  float alpha = a_color.a * u_opacity * fog;
  v_color = vec4(rgb * shade * alpha, alpha);
}
`

const FRAGMENT = `
precision mediump float;
varying vec4 v_color;
void main() {
  gl_FragColor = v_color;
}
`

export interface BuildingDraw {
  /** Identity of the mesh, for its GPU buffer. */
  key: object
  mesh: BuildingMesh
  matrix: Float32Array
  /** Pixels per metre at the map's zoom and the tile's latitude. */
  heightScale: number
  opacity: number
}

interface Program {
  program: WebGLProgram
  a_pos: number
  a_normal: number
  a_color: number
  a_t: number
  u_matrix: WebGLUniformLocation | null
  u_heightScale: WebGLUniformLocation | null
  u_light: WebGLUniformLocation | null
  u_opacity: WebGLUniformLocation | null
  u_fog: WebGLUniformLocation | null
}

/**
 * The canvas and GL state buildings are drawn with. `active` is false where
 * WebGL is unavailable, and the layer then falls back to flat footprints in
 * its tiles.
 */
export class BuildingOverlay {
  canvas: HTMLCanvasElement | null = null
  gl: WebGLRenderingContext | null = null
  program: Program | null = null
  buffers: WeakMap<object, { buffer: WebGLBuffer, mesh: BuildingMesh }> = new WeakMap()
  ratio = 1

  constructor(pane: HTMLElement | null) {
    if (!pane || typeof document === 'undefined')
      return
    const canvas = document.createElement('canvas')
    canvas.className = 'tsmap-building-overlay'
    if (canvas.style) {
      canvas.style.position = 'absolute'
      canvas.style.left = '0'
      canvas.style.top = '0'
      canvas.style.pointerEvents = 'none'
    }
    let gl: WebGLRenderingContext | null = null
    try {
      gl = (canvas.getContext('webgl', { antialias: true, depth: true, premultipliedAlpha: true, alpha: true }) as WebGLRenderingContext | null)
    }
    catch {
      gl = null
    }
    if (!gl || typeof gl.createShader !== 'function')
      return
    const program = compile(gl)
    if (!program)
      return
    pane.appendChild(canvas)
    this.canvas = canvas
    this.gl = gl
    this.program = program
  }

  get active(): boolean {
    return !!this.gl && !!this.program
  }

  /** Size the canvas to the viewport and pin it there against the pane offset. */
  resize(width: number, height: number, ratio: number, pos: [number, number]): void {
    const canvas = this.canvas
    if (!canvas)
      return
    this.ratio = ratio
    const w = Math.max(1, Math.round(width * ratio))
    const h = Math.max(1, Math.round(height * ratio))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    if (canvas.style) {
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      canvas.style.transform = `translate3d(${-pos[0]}px, ${-pos[1]}px, 0)`
    }
  }

  /**
   * Draw a frame. Two passes: depth only, then colour where each pixel's
   * nearest surface is — so a fading or translucent building shows its front
   * face over the ground, not every wall behind it.
   */
  render(draws: BuildingDraw[], options: { light: [number, number], fog: [number, number] }): void {
    const gl = this.gl
    const p = this.program
    if (!gl || !p || !this.canvas)
      return

    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clearDepth(1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (!draws.length)
      return

    gl.useProgram(p.program)
    gl.enable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.uniform2f(p.u_light, options.light[0], options.light[1])
    gl.uniform2f(p.u_fog, options.fog[0], options.fog[1])

    const stride = BUILDING_STRIDE
    const bind = (draw: BuildingDraw): number => {
      const buffer = this._buffer(draw)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.enableVertexAttribArray(p.a_pos)
      gl.vertexAttribPointer(p.a_pos, 3, gl.FLOAT, false, stride, 0)
      gl.enableVertexAttribArray(p.a_normal)
      gl.vertexAttribPointer(p.a_normal, 2, gl.BYTE, true, stride, 12)
      gl.enableVertexAttribArray(p.a_t)
      gl.vertexAttribPointer(p.a_t, 1, gl.UNSIGNED_BYTE, true, stride, 14)
      gl.enableVertexAttribArray(p.a_color)
      gl.vertexAttribPointer(p.a_color, 4, gl.UNSIGNED_BYTE, true, stride, 16)
      gl.uniformMatrix4fv(p.u_matrix, false, draw.matrix)
      gl.uniform1f(p.u_heightScale, draw.heightScale)
      gl.uniform1f(p.u_opacity, draw.opacity)
      return draw.mesh.count
    }

    // Depth pass.
    gl.colorMask(false, false, false, false)
    gl.depthMask(true)
    gl.depthFunc(gl.LESS)
    gl.disable(gl.BLEND)
    for (const draw of draws)
      gl.drawArrays(gl.TRIANGLES, 0, bind(draw))

    // Colour pass, nearest surface only.
    gl.colorMask(true, true, true, true)
    gl.depthMask(false)
    gl.depthFunc(gl.LEQUAL)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    for (const draw of draws)
      gl.drawArrays(gl.TRIANGLES, 0, bind(draw))
    gl.depthMask(true)
  }

  /** Clear the canvas without drawing, as when nothing is in view. */
  clear(): void {
    const gl = this.gl
    if (!gl)
      return
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  }

  _buffer(draw: BuildingDraw): WebGLBuffer {
    const gl = this.gl!
    const cached = this.buffers.get(draw.key)
    if (cached && cached.mesh === draw.mesh)
      return cached.buffer
    if (cached)
      gl.deleteBuffer(cached.buffer)
    const buffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, draw.mesh.data, gl.STATIC_DRAW)
    this.buffers.set(draw.key, { buffer, mesh: draw.mesh })
    return buffer
  }

  /** Free a mesh's GPU buffer, when its tile goes. */
  release(key: object): void {
    const cached = this.buffers.get(key)
    if (cached && this.gl)
      this.gl.deleteBuffer(cached.buffer)
    this.buffers.delete(key)
  }

  remove(): void {
    const ext = this.gl?.getExtension?.('WEBGL_lose_context')
    ext?.loseContext()
    this.canvas?.remove()
    this.canvas = null
    this.gl = null
    this.program = null
  }
}

function compile(gl: WebGLRenderingContext): Program | null {
  const shader = (type: number, source: string): WebGLShader | null => {
    const s = gl.createShader(type)
    if (!s)
      return null
    gl.shaderSource(s, source)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[ts-maps] building shader failed:', gl.getShaderInfoLog(s))
      return null
    }
    return s
  }
  const vs = shader(gl.VERTEX_SHADER, VERTEX)
  const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT)
  const program = gl.createProgram()
  if (!vs || !fs || !program)
    return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[ts-maps] building program failed:', gl.getProgramInfoLog(program))
    return null
  }
  return {
    program,
    a_pos: gl.getAttribLocation(program, 'a_pos'),
    a_normal: gl.getAttribLocation(program, 'a_normal'),
    a_color: gl.getAttribLocation(program, 'a_color'),
    a_t: gl.getAttribLocation(program, 'a_t'),
    u_matrix: gl.getUniformLocation(program, 'u_matrix'),
    u_heightScale: gl.getUniformLocation(program, 'u_heightScale'),
    u_light: gl.getUniformLocation(program, 'u_light'),
    u_opacity: gl.getUniformLocation(program, 'u_opacity'),
    u_fog: gl.getUniformLocation(program, 'u_fog'),
  }
}
