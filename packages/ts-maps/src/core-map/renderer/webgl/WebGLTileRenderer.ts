// WebGL tile renderer — draws fill/line/circle primitives for MVT style
// layers onto an HTMLCanvasElement backed by a WebGL2 context.
//
// The renderer is intentionally thin: callers pre-triangulate polygons (via
// `earcut`) before invoking `drawFill`, hand in flat `Float32Array` linestrip
// buffers for `drawLine`, and raw center coordinates for `drawCircles`.
// On-the-fly tessellation for lines + instanced-quad expansion for circles
// is handled internally.
//
// Fallback semantics: the GLContext constructor throws `WebGLUnsupportedError`
// when WebGL2 isn't available; callers catch that and revert to Canvas2D.

import {
  CIRCLE_FRAG,
  CIRCLE_VERT,
  FILL_EXTRUSION_FRAG,
  FILL_EXTRUSION_VERT,
  FILL_FRAG,
  FILL_VERT,
  LINE_FRAG,
  LINE_VERT,
  SKY_FRAG,
  SKY_VERT,
} from './shaders'
import { earcut, flatten } from '../../geometry/earcut'
import { GLContext } from './GLContext'

type RGBA = [number, number, number, number]

export interface LineOptions {
  width: number
  color: RGBA
  cap?: 'butt' | 'round' | 'square'
  join?: 'miter' | 'round' | 'bevel'
}

export interface CircleOptions {
  radius: number
  color: RGBA
  strokeColor?: RGBA
  strokeWidth?: number
}

interface FillProgram {
  program: WebGLProgram
  u_matrix: WebGLUniformLocation | null
  u_color: WebGLUniformLocation | null
  a_position: number
}

interface LineProgram {
  program: WebGLProgram
  u_matrix: WebGLUniformLocation | null
  u_color: WebGLUniformLocation | null
  u_width: WebGLUniformLocation | null
  a_position: number
  a_normal: number
  a_progress: number
}

interface CircleProgram {
  program: WebGLProgram
  u_matrix: WebGLUniformLocation | null
  u_color: WebGLUniformLocation | null
  u_stroke_color: WebGLUniformLocation | null
  u_stroke_width: WebGLUniformLocation | null
  u_radius: WebGLUniformLocation | null
  a_center: number
  a_offset: number
}

interface FillExtrusionProgram {
  program: WebGLProgram
  u_matrix: WebGLUniformLocation | null
  u_color: WebGLUniformLocation | null
  u_opacity: WebGLUniformLocation | null
  a_position: number
  a_normal: number
}

interface SkyProgram {
  program: WebGLProgram
  u_sky_color: WebGLUniformLocation | null
  u_horizon_color: WebGLUniformLocation | null
  u_pitch_t: WebGLUniformLocation | null
  u_horizon_blend: WebGLUniformLocation | null
  a_position: number
}

export interface FillExtrusionFootprint {
  /**
   * Outer + hole rings in tile-local pixel space. First ring is the outer
   * polygon; subsequent rings are holes (CCW/CW convention matches earcut).
   */
  rings: Array<Array<{ x: number, y: number }>>
}

export class WebGLTileRenderer {
  ctx: GLContext
  _projection: Float32Array
  _fill: FillProgram
  _line: LineProgram
  _circle: CircleProgram
  _fillExtrusion: FillExtrusionProgram | null
  _sky: SkyProgram | null
  _buffers: WebGLBuffer[]

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = new GLContext(canvas)
    this._projection = new Float32Array(16)
    this._buffers = []

    // Default projection: identity. Callers should overwrite via
    // `setProjectionMatrix` before drawing.
    this._projection[0] = 1
    this._projection[5] = 1
    this._projection[10] = 1
    this._projection[15] = 1

    this._fill = this._buildFillProgram()
    this._line = this._buildLineProgram()
    this._circle = this._buildCircleProgram()
    // Extrusion and sky programs are built on first use — they're optional
    // features that callers may never exercise.
    this._fillExtrusion = null
    this._sky = null
  }

  setProjectionMatrix(m: Float32Array): void {
    this._projection.set(m)
  }

  clear(): void {
    this.ctx.clear(0, 0, 0, 0)
  }

  destroy(): void {
    const gl = this.ctx.gl
    for (const buf of this._buffers)
      gl.deleteBuffer(buf)
    this._buffers.length = 0
    gl.deleteProgram(this._fill.program)
    gl.deleteProgram(this._line.program)
    gl.deleteProgram(this._circle.program)
    if (this._fillExtrusion) {
      gl.deleteProgram(this._fillExtrusion.program)
      this._fillExtrusion = null
    }
    if (this._sky) {
      gl.deleteProgram(this._sky.program)
      this._sky = null
    }
  }

  // -------------------------------------------------------------------------
  // Draw entry points
  // -------------------------------------------------------------------------

  drawFill(triangles: Float32Array, color: RGBA): void {
    if (triangles.length < 6)
      return

    const gl = this.ctx.gl
    const prog = this._fill

    gl.useProgram(prog.program)
    if (prog.u_matrix)
      gl.uniformMatrix4fv(prog.u_matrix, false, this._projection)
    if (prog.u_color)
      gl.uniform4f(prog.u_color, color[0], color[1], color[2], color[3])

    const buf = this.ctx.createBuffer(triangles)
    this._buffers.push(buf)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.enableVertexAttribArray(prog.a_position)
    gl.vertexAttribPointer(prog.a_position, 2, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, triangles.length / 2)

    this._disposeBuffer(buf)
  }

  drawLine(linestrip: Float32Array, options: LineOptions): void {
    if (linestrip.length < 4)
      return

    const verts = tessellateLine(linestrip)
    if (verts.length === 0)
      return

    const gl = this.ctx.gl
    const prog = this._line

    gl.useProgram(prog.program)
    if (prog.u_matrix)
      gl.uniformMatrix4fv(prog.u_matrix, false, this._projection)
    if (prog.u_color)
      gl.uniform4f(prog.u_color, options.color[0], options.color[1], options.color[2], options.color[3])
    if (prog.u_width)
      gl.uniform1f(prog.u_width, options.width)

    const buf = this.ctx.createBuffer(verts)
    this._buffers.push(buf)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)

    // Stride: 5 float32 per vertex = 2 (pos) + 2 (normal) + 1 (progress).
    const stride = 5 * 4
    gl.enableVertexAttribArray(prog.a_position)
    gl.vertexAttribPointer(prog.a_position, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(prog.a_normal)
    gl.vertexAttribPointer(prog.a_normal, 2, gl.FLOAT, false, stride, 8)
    gl.enableVertexAttribArray(prog.a_progress)
    gl.vertexAttribPointer(prog.a_progress, 1, gl.FLOAT, false, stride, 16)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts.length / 5)

    this._disposeBuffer(buf)
  }

  drawCircles(centers: Float32Array, options: CircleOptions): void {
    if (centers.length < 2)
      return

    const gl = this.ctx.gl
    const prog = this._circle

    gl.useProgram(prog.program)
    if (prog.u_matrix)
      gl.uniformMatrix4fv(prog.u_matrix, false, this._projection)
    if (prog.u_color)
      gl.uniform4f(prog.u_color, options.color[0], options.color[1], options.color[2], options.color[3])
    const stroke = options.strokeColor ?? [0, 0, 0, 0]
    if (prog.u_stroke_color)
      gl.uniform4f(prog.u_stroke_color, stroke[0], stroke[1], stroke[2], stroke[3])
    if (prog.u_stroke_width)
      gl.uniform1f(prog.u_stroke_width, options.strokeWidth ?? 0)
    if (prog.u_radius)
      gl.uniform1f(prog.u_radius, options.radius)

    // Try the instanced path first — WebGL2 guarantees it, but we keep a
    // guard for defensive robustness (see class comment).
    const supportsInstanced = typeof (gl as WebGL2RenderingContext & {
      drawArraysInstanced?: unknown
    }).drawArraysInstanced === 'function'

    if (supportsInstanced) {
      this._drawCirclesInstanced(prog, centers)
    }
    else {
      this._drawCirclesBatched(prog, centers)
    }
  }

  // ---------------------------------------------------------------------
  // Fill-extrusion — extrudes polygon footprints into 3D prisms.
  //
  // For each footprint the renderer emits:
  //   - a top cap (triangulated by `earcut`, normals pointing up)
  //   - side walls (one quad per outer edge, normal horizontal outward)
  //
  // `base` offsets the bottom of each prism; the default 0 plants the wall
  // on the ground. Callers supply per-feature height values.
  // ---------------------------------------------------------------------
  drawFillExtrusion(
    footprints: FillExtrusionFootprint[],
    heights: number[],
    base: number[] | number,
    color: RGBA,
    opacity: number,
    projectionMatrix?: Float32Array,
  ): number {
    if (footprints.length === 0)
      return 0

    const prog = this._fillExtrusion ?? (this._fillExtrusion = this._buildFillExtrusionProgram())
    const gl = this.ctx.gl

    gl.useProgram(prog.program)
    const proj = projectionMatrix ?? this._projection
    if (prog.u_matrix)
      gl.uniformMatrix4fv(prog.u_matrix, false, proj)
    if (prog.u_color)
      gl.uniform4f(prog.u_color, color[0], color[1], color[2], color[3])
    if (prog.u_opacity)
      gl.uniform1f(prog.u_opacity, opacity)

    // Build one big interleaved vertex buffer: [x, y, z, nx, ny, nz].
    const verts: number[] = []

    for (let f = 0; f < footprints.length; f++) {
      const rings = footprints[f]!.rings
      if (!rings || rings.length === 0)
        continue
      const h = heights[f] ?? 0
      const b = typeof base === 'number' ? base : (base[f] ?? 0)
      if (h <= b)
        continue

      // ---- top cap ----
      const flat = flatten(rings)
      const indices = earcut(flat.vertices, flat.holes, 2)
      for (let i = 0; i < indices.length; i++) {
        const vi = indices[i]!
        const x = flat.vertices[vi * 2] as number
        const y = flat.vertices[vi * 2 + 1] as number
        verts.push(x, y, h, 0, 0, 1)
      }

      // ---- side walls ----
      for (const ring of rings) {
        if (ring.length < 2)
          continue
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!
          const c = ring[(i + 1) % ring.length]!
          // Outward horizontal normal: rotate edge vector -90°.
          let nx = c.y - a.y
          let ny = -(c.x - a.x)
          const len = Math.hypot(nx, ny) || 1
          nx /= len
          ny /= len

          // Two triangles per quad (a.bottom, c.bottom, c.top) + (a.bottom, c.top, a.top).
          verts.push(a.x, a.y, b, nx, ny, 0)
          verts.push(c.x, c.y, b, nx, ny, 0)
          verts.push(c.x, c.y, h, nx, ny, 0)

          verts.push(a.x, a.y, b, nx, ny, 0)
          verts.push(c.x, c.y, h, nx, ny, 0)
          verts.push(a.x, a.y, h, nx, ny, 0)
        }
      }
    }

    if (verts.length === 0)
      return 0

    const data = new Float32Array(verts)
    const buf = this.ctx.createBuffer(data)
    this._buffers.push(buf)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)

    const stride = 6 * 4
    gl.enableVertexAttribArray(prog.a_position)
    gl.vertexAttribPointer(prog.a_position, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(prog.a_normal)
    gl.vertexAttribPointer(prog.a_normal, 3, gl.FLOAT, false, stride, 12)

    const vertexCount = verts.length / 6
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount)

    this._disposeBuffer(buf)
    return vertexCount
  }

  // ---------------------------------------------------------------------
  // Sky — draws a full-screen quad with a vertical gradient. The caller
  // supplies the sky / horizon colours + a `pitchT` in [0, 1] controlling
  // overall visibility, plus `horizonBlend` controlling the gradient width.
  // ---------------------------------------------------------------------
  drawSky(
    skyColor: RGBA,
    horizonColor: RGBA,
    pitchT: number,
    horizonBlend: number,
  ): void {
    if (pitchT <= 0)
      return

    const prog = this._sky ?? (this._sky = this._buildSkyProgram())
    const gl = this.ctx.gl

    gl.useProgram(prog.program)
    if (prog.u_sky_color)
      gl.uniform4f(prog.u_sky_color, skyColor[0], skyColor[1], skyColor[2], skyColor[3])
    if (prog.u_horizon_color)
      gl.uniform4f(prog.u_horizon_color, horizonColor[0], horizonColor[1], horizonColor[2], horizonColor[3])
    if (prog.u_pitch_t)
      gl.uniform1f(prog.u_pitch_t, pitchT)
    if (prog.u_horizon_blend)
      gl.uniform1f(prog.u_horizon_blend, horizonBlend)

    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ])
    const buf = this.ctx.createBuffer(quad)
    this._buffers.push(buf)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.enableVertexAttribArray(prog.a_position)
    gl.vertexAttribPointer(prog.a_position, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    this._disposeBuffer(buf)
  }

  // ---------------------------------------------------------------------
  // Terrain — draws a warped ground mesh built from a DEM tile. The caller
  // supplies a pre-built index buffer and an interleaved `[x, y, z, nx, ny, nz]`
  // vertex buffer (see `buildTerrainMesh` under `geo/terrainMesh.ts`).
  // Reuses the fill-extrusion program because the vertex layout and
  // lighting model match exactly.
  // ---------------------------------------------------------------------
  drawTerrain(
    positions: Float32Array,
    indices: Uint32Array,
    color: RGBA,
    opacity: number,
    projectionMatrix?: Float32Array,
  ): number {
    if (positions.length === 0 || indices.length === 0)
      return 0

    const prog = this._fillExtrusion ?? (this._fillExtrusion = this._buildFillExtrusionProgram())
    const gl = this.ctx.gl

    gl.useProgram(prog.program)
    const proj = projectionMatrix ?? this._projection
    if (prog.u_matrix)
      gl.uniformMatrix4fv(prog.u_matrix, false, proj)
    if (prog.u_color)
      gl.uniform4f(prog.u_color, color[0], color[1], color[2], color[3])
    if (prog.u_opacity)
      gl.uniform1f(prog.u_opacity, opacity)

    const vbo = this.ctx.createBuffer(positions)
    this._buffers.push(vbo)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)

    const stride = 6 * 4
    gl.enableVertexAttribArray(prog.a_position)
    gl.vertexAttribPointer(prog.a_position, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(prog.a_normal)
    gl.vertexAttribPointer(prog.a_normal, 3, gl.FLOAT, false, stride, 12)

    const ibo = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
    gl.deleteBuffer(ibo)
    this._disposeBuffer(vbo)

    return indices.length
  }

  _drawCirclesInstanced(prog: CircleProgram, centers: Float32Array): void {
    const gl = this.ctx.gl

    // Unit quad corners in [-1, 1] space, two triangles.
    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ])
    const quadBuf = this.ctx.createBuffer(quad)
    this._buffers.push(quadBuf)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
    gl.enableVertexAttribArray(prog.a_offset)
    gl.vertexAttribPointer(prog.a_offset, 2, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(prog.a_offset, 0)

    const centerBuf = this.ctx.createBuffer(centers)
    this._buffers.push(centerBuf)
    gl.bindBuffer(gl.ARRAY_BUFFER, centerBuf)
    gl.enableVertexAttribArray(prog.a_center)
    gl.vertexAttribPointer(prog.a_center, 2, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(prog.a_center, 1)

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, centers.length / 2)

    gl.vertexAttribDivisor(prog.a_center, 0)
    this._disposeBuffer(quadBuf)
    this._disposeBuffer(centerBuf)
  }

  _drawCirclesBatched(prog: CircleProgram, centers: Float32Array): void {
    const gl = this.ctx.gl
    const count = centers.length / 2
    const verts = new Float32Array(count * 6 * 4) // 6 vtx * (2 center + 2 offset)
    const quadCorners = [
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ]

    for (let i = 0; i < count; i++) {
      const cx = centers[i * 2] as number
      const cy = centers[i * 2 + 1] as number
      for (let v = 0; v < 6; v++) {
        const off = (i * 6 + v) * 4
        verts[off] = cx
        verts[off + 1] = cy
        verts[off + 2] = quadCorners[v * 2] as number
        verts[off + 3] = quadCorners[v * 2 + 1] as number
      }
    }

    const buf = this.ctx.createBuffer(verts)
    this._buffers.push(buf)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    const stride = 4 * 4
    gl.enableVertexAttribArray(prog.a_center)
    gl.vertexAttribPointer(prog.a_center, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(prog.a_offset)
    gl.vertexAttribPointer(prog.a_offset, 2, gl.FLOAT, false, stride, 8)

    gl.drawArrays(gl.TRIANGLES, 0, count * 6)

    this._disposeBuffer(buf)
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  _buildFillProgram(): FillProgram {
    const program = this.ctx.compileProgram(FILL_VERT, FILL_FRAG)
    const gl = this.ctx.gl
    return {
      program,
      u_matrix: gl.getUniformLocation(program, 'u_matrix'),
      u_color: gl.getUniformLocation(program, 'u_color'),
      a_position: gl.getAttribLocation(program, 'a_position'),
    }
  }

  _buildLineProgram(): LineProgram {
    const program = this.ctx.compileProgram(LINE_VERT, LINE_FRAG)
    const gl = this.ctx.gl
    return {
      program,
      u_matrix: gl.getUniformLocation(program, 'u_matrix'),
      u_color: gl.getUniformLocation(program, 'u_color'),
      u_width: gl.getUniformLocation(program, 'u_width'),
      a_position: gl.getAttribLocation(program, 'a_position'),
      a_normal: gl.getAttribLocation(program, 'a_normal'),
      a_progress: gl.getAttribLocation(program, 'a_progress'),
    }
  }

  _buildCircleProgram(): CircleProgram {
    const program = this.ctx.compileProgram(CIRCLE_VERT, CIRCLE_FRAG)
    const gl = this.ctx.gl
    return {
      program,
      u_matrix: gl.getUniformLocation(program, 'u_matrix'),
      u_color: gl.getUniformLocation(program, 'u_color'),
      u_stroke_color: gl.getUniformLocation(program, 'u_stroke_color'),
      u_stroke_width: gl.getUniformLocation(program, 'u_stroke_width'),
      u_radius: gl.getUniformLocation(program, 'u_radius'),
      a_center: gl.getAttribLocation(program, 'a_center'),
      a_offset: gl.getAttribLocation(program, 'a_offset'),
    }
  }

  _buildFillExtrusionProgram(): FillExtrusionProgram {
    const program = this.ctx.compileProgram(FILL_EXTRUSION_VERT, FILL_EXTRUSION_FRAG)
    const gl = this.ctx.gl
    return {
      program,
      u_matrix: gl.getUniformLocation(program, 'u_matrix'),
      u_color: gl.getUniformLocation(program, 'u_color'),
      u_opacity: gl.getUniformLocation(program, 'u_opacity'),
      a_position: gl.getAttribLocation(program, 'a_position'),
      a_normal: gl.getAttribLocation(program, 'a_normal'),
    }
  }

  _buildSkyProgram(): SkyProgram {
    const program = this.ctx.compileProgram(SKY_VERT, SKY_FRAG)
    const gl = this.ctx.gl
    return {
      program,
      u_sky_color: gl.getUniformLocation(program, 'u_sky_color'),
      u_horizon_color: gl.getUniformLocation(program, 'u_horizon_color'),
      u_pitch_t: gl.getUniformLocation(program, 'u_pitch_t'),
      u_horizon_blend: gl.getUniformLocation(program, 'u_horizon_blend'),
      a_position: gl.getAttribLocation(program, 'a_position'),
    }
  }

  // Drop a transient buffer off the retention list + GL. Buffers pushed onto
  // `_buffers` are tracked for `destroy()`; per-draw buffers are cleaned up
  // eagerly here.
  _disposeBuffer(buf: WebGLBuffer): void {
    const gl = this.ctx.gl
    const idx = this._buffers.indexOf(buf)
    if (idx >= 0)
      this._buffers.splice(idx, 1)
    gl.deleteBuffer(buf)
  }
}

// ---------------------------------------------------------------------------
// Line tessellation — builds a triangle strip with per-vertex extrusion
// normals (miter joints, butt caps). Output layout per vertex:
//   [x, y, nx, ny, progress]
// where `progress` is +1 on the outer side and -1 on the inner side. The
// fragment shader uses |progress| for the AA feather.
// ---------------------------------------------------------------------------

function tessellateLine(linestrip: Float32Array): Float32Array {
  const n = linestrip.length / 2
  if (n < 2)
    return new Float32Array(0)

  const out: number[] = []

  for (let i = 0; i < n; i++) {
    const x = linestrip[i * 2] as number
    const y = linestrip[i * 2 + 1] as number

    // Tangent = weighted average of incoming + outgoing direction.
    let tx = 0
    let ty = 0
    if (i > 0) {
      const px = linestrip[(i - 1) * 2] as number
      const py = linestrip[(i - 1) * 2 + 1] as number
      const dx = x - px
      const dy = y - py
      const len = Math.hypot(dx, dy) || 1
      tx += dx / len
      ty += dy / len
    }
    if (i < n - 1) {
      const nx = linestrip[(i + 1) * 2] as number
      const ny = linestrip[(i + 1) * 2 + 1] as number
      const dx = nx - x
      const dy = ny - y
      const len = Math.hypot(dx, dy) || 1
      tx += dx / len
      ty += dy / len
    }
    const tlen = Math.hypot(tx, ty) || 1
    tx /= tlen
    ty /= tlen

    // Normal = 90° rotation of tangent.
    const nx = -ty
    const ny = tx

    out.push(x, y, nx, ny, 1)
    out.push(x, y, -nx, -ny, -1)
  }

  return new Float32Array(out)
}
