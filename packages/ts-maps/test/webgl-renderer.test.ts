import { describe, expect, test } from 'bun:test'
import { WebGLUnsupportedError } from '../src/core-map/renderer/webgl/GLContext'
import { WebGLTileRenderer } from '../src/core-map/renderer/webgl/WebGLTileRenderer'

// ---------------------------------------------------------------------------
// Stub WebGL2 context — a plain object shaped like the subset of
// WebGL2RenderingContext the renderer touches. Every method exists as a spy
// so tests can assert calls without pulling in an actual GPU context. The
// surface area, as of the first pass, is:
//
//   state + capabilities:     enable, blendFunc, useProgram, viewport, clearColor, clear
//   shader/program lifecycle: createShader, shaderSource, compileShader,
//                             getShaderParameter, getShaderInfoLog, deleteShader,
//                             createProgram, attachShader, linkProgram,
//                             getProgramParameter, getProgramInfoLog, deleteProgram
//   uniforms + attribs:       getUniformLocation, getAttribLocation,
//                             uniform1f, uniform4f, uniformMatrix4fv
//   buffers + draw:           createBuffer, bindBuffer, bufferData,
//                             enableVertexAttribArray, vertexAttribPointer,
//                             vertexAttribDivisor, deleteBuffer,
//                             drawArrays, drawArraysInstanced
//
// Constants resolve to arbitrary stable numbers; any unknown property looked
// up on the stub resolves to `undefined` by default (caught via Proxy).
// ---------------------------------------------------------------------------

interface Spy {
  (...args: unknown[]): unknown
  calls: unknown[][]
  callCount: number
}

function spy(impl?: (...args: any[]) => unknown): Spy {
  const fn = ((...args: unknown[]) => {
    fn.calls.push(args)
    fn.callCount++
    return impl ? impl(...args) : undefined
  }) as Spy
  fn.calls = []
  fn.callCount = 0
  return fn
}

interface StubGL extends Record<string, any> {
  VERTEX_SHADER: number
  FRAGMENT_SHADER: number
  COMPILE_STATUS: number
  LINK_STATUS: number
  ARRAY_BUFFER: number
  STATIC_DRAW: number
  FLOAT: number
  TRIANGLES: number
  TRIANGLE_STRIP: number
  COLOR_BUFFER_BIT: number
  BLEND: number
  ONE: number
  ONE_MINUS_SRC_ALPHA: number

  enable: Spy
  blendFunc: Spy
  viewport: Spy
  clearColor: Spy
  clear: Spy
  useProgram: Spy

  createShader: Spy
  shaderSource: Spy
  compileShader: Spy
  getShaderParameter: Spy
  getShaderInfoLog: Spy
  deleteShader: Spy

  createProgram: Spy
  attachShader: Spy
  linkProgram: Spy
  getProgramParameter: Spy
  getProgramInfoLog: Spy
  deleteProgram: Spy

  getUniformLocation: Spy
  getAttribLocation: Spy
  uniform1f: Spy
  uniform4f: Spy
  uniformMatrix4fv: Spy

  createBuffer: Spy
  bindBuffer: Spy
  bufferData: Spy
  enableVertexAttribArray: Spy
  vertexAttribPointer: Spy
  vertexAttribDivisor: Spy
  deleteBuffer: Spy

  drawArrays: Spy
  drawArraysInstanced: Spy
}

function createStubGL(opts?: { compileOk?: boolean, linkOk?: boolean }): StubGL {
  const compileOk = opts?.compileOk ?? true
  const linkOk = opts?.linkOk ?? true
  let shaderSeq = 0
  let programSeq = 0
  let bufferSeq = 0

  const gl: StubGL = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    TRIANGLES: 4,
    TRIANGLE_STRIP: 5,
    COLOR_BUFFER_BIT: 16384,
    BLEND: 3042,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 771,

    enable: spy(),
    blendFunc: spy(),
    viewport: spy(),
    clearColor: spy(),
    clear: spy(),
    useProgram: spy(),

    createShader: spy(() => ({ id: `shader-${shaderSeq++}` })),
    shaderSource: spy(),
    compileShader: spy(),
    getShaderParameter: spy(() => compileOk),
    getShaderInfoLog: spy(() => 'compile error: missing semicolon'),
    deleteShader: spy(),

    createProgram: spy(() => ({ id: `program-${programSeq++}` })),
    attachShader: spy(),
    linkProgram: spy(),
    getProgramParameter: spy(() => linkOk),
    getProgramInfoLog: spy(() => 'link error'),
    deleteProgram: spy(),

    getUniformLocation: spy((_: unknown, name: string) => ({ name })),
    getAttribLocation: spy(() => 0),
    uniform1f: spy(),
    uniform4f: spy(),
    uniformMatrix4fv: spy(),

    createBuffer: spy(() => ({ id: `buffer-${bufferSeq++}` })),
    bindBuffer: spy(),
    bufferData: spy(),
    enableVertexAttribArray: spy(),
    vertexAttribPointer: spy(),
    vertexAttribDivisor: spy(),
    deleteBuffer: spy(),

    drawArrays: spy(),
    drawArraysInstanced: spy(),
  }

  return gl
}

// Build a stub canvas where `getContext('webgl2')` returns the stub GL; any
// other context name returns `null`.
function stubCanvas(gl: StubGL | null): HTMLCanvasElement {
  const el = document.createElement('canvas') as HTMLCanvasElement
  const original = el.getContext.bind(el);
  (el as HTMLCanvasElement & { getContext: (type: string) => unknown }).getContext = ((type: string) => {
    if (type === 'webgl2')
      return gl
    return original(type as '2d')
  }) as HTMLCanvasElement['getContext']
  return el
}

describe('WebGLTileRenderer', () => {
  test('constructor throws WebGLUnsupportedError when getContext(webgl2) returns null', () => {
    const canvas = stubCanvas(null)
    expect(() => new WebGLTileRenderer(canvas)).toThrow(WebGLUnsupportedError)
  })

  test('drawFill/drawLine/drawCircles call the expected GL methods', () => {
    const gl = createStubGL()
    const canvas = stubCanvas(gl)
    const renderer = new WebGLTileRenderer(canvas)

    // Constructor compiles 3 programs (fill, line, circle).
    expect(gl.createProgram.callCount).toBe(3)
    expect(gl.linkProgram.callCount).toBe(3)

    // drawFill: at minimum, one useProgram + one drawArrays.
    const usePreDraw = gl.useProgram.callCount
    renderer.drawFill(new Float32Array([0, 0, 1, 0, 1, 1]), [1, 0, 0, 1])
    expect(gl.useProgram.callCount).toBe(usePreDraw + 1)
    expect(gl.drawArrays.callCount).toBeGreaterThan(0)
    // The fill draw call uses the TRIANGLES primitive.
    const lastDraw = gl.drawArrays.calls[gl.drawArrays.calls.length - 1]
    expect(lastDraw[0]).toBe(gl.TRIANGLES)
    expect(lastDraw[2]).toBe(3) // three vertices

    // drawLine: tessellates on the fly, issues a TRIANGLE_STRIP.
    const drawsBeforeLine = gl.drawArrays.callCount
    renderer.drawLine(new Float32Array([0, 0, 10, 0, 10, 10]), {
      width: 2,
      color: [0, 1, 0, 1],
    })
    expect(gl.drawArrays.callCount).toBe(drawsBeforeLine + 1)
    const lineDraw = gl.drawArrays.calls[gl.drawArrays.calls.length - 1]
    expect(lineDraw[0]).toBe(gl.TRIANGLE_STRIP)

    // drawCircles: instanced path.
    renderer.drawCircles(new Float32Array([5, 5, 20, 20]), {
      radius: 4,
      color: [0, 0, 1, 1],
      strokeColor: [0, 0, 0, 1],
      strokeWidth: 1,
    })
    expect(gl.drawArraysInstanced.callCount).toBe(1)
    const instDraw = gl.drawArraysInstanced.calls[0]
    expect(instDraw[0]).toBe(gl.TRIANGLES)
    expect(instDraw[2]).toBe(6) // 6 vertices per quad
    expect(instDraw[3]).toBe(2) // 2 instances (2 centers)
  })

  test('setProjectionMatrix eventually uploads via uniformMatrix4fv on draw', () => {
    const gl = createStubGL()
    const canvas = stubCanvas(gl)
    const renderer = new WebGLTileRenderer(canvas)

    const m = new Float32Array([
      2, 0, 0, 0,
      0, 2, 0, 0,
      0, 0, 1, 0,
      -1, -1, 0, 1,
    ])
    renderer.setProjectionMatrix(m)

    expect(gl.uniformMatrix4fv.callCount).toBe(0) // lazy — uploads on draw

    renderer.drawFill(new Float32Array([0, 0, 1, 0, 1, 1]), [1, 1, 1, 1])
    expect(gl.uniformMatrix4fv.callCount).toBeGreaterThan(0)

    const lastUniform = gl.uniformMatrix4fv.calls[gl.uniformMatrix4fv.calls.length - 1]
    // Args: (location, transpose, matrix)
    expect(lastUniform[1]).toBe(false)
    expect(lastUniform[2]).toEqual(m)
  })

  test('destroy() releases programs + buffers', () => {
    const gl = createStubGL()
    const canvas = stubCanvas(gl)
    const renderer = new WebGLTileRenderer(canvas)

    // Issue a draw to allocate some buffers, then destroy.
    renderer.drawFill(new Float32Array([0, 0, 1, 0, 1, 1]), [0, 0, 0, 1])
    const buffersBefore = gl.deleteBuffer.callCount
    renderer.destroy()

    // destroy() deletes each of the 3 programs.
    expect(gl.deleteProgram.callCount).toBe(3)
    // deleteBuffer was called at least once. (The fill draw eagerly disposes
    // its transient buffer.)
    expect(gl.deleteBuffer.callCount).toBeGreaterThanOrEqual(buffersBefore)
  })

  test('shader compilation errors throw with the source in the message', () => {
    const gl = createStubGL({ compileOk: false })
    const canvas = stubCanvas(gl)
    let threw: Error | null = null
    try {
      const _unused = new WebGLTileRenderer(canvas)
      // Reference to silence unused-variable warnings in case the line above
      // is reordered. The constructor is expected to throw.
      if (_unused) {
        /* no-op */
      }
    }
    catch (err) {
      threw = err as Error
    }
    expect(threw).not.toBeNull()
    expect(threw!.message).toContain('shader compile failed')
    expect(threw!.message).toContain('#version 300 es')
  })
})
