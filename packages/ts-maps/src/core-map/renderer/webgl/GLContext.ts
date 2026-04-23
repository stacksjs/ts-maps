// Thin wrapper around a WebGL2 rendering context. Centralises program
// compilation + buffer creation + viewport resizing so the higher-level
// renderer stays focused on draw orchestration. When WebGL2 is unavailable,
// the constructor throws a typed error so callers can fall back cleanly.

export class WebGLUnsupportedError extends Error {
  constructor(message?: string) {
    super(message ?? 'WebGL2 is not supported in this environment.')
    this.name = 'WebGLUnsupportedError'
  }
}

export interface GLContextOptions {
  alpha?: boolean
  premultipliedAlpha?: boolean
  antialias?: boolean
}

export class GLContext {
  gl: WebGL2RenderingContext
  canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement, opts?: GLContextOptions) {
    this.canvas = canvas
    const attrs: WebGLContextAttributes = {
      alpha: opts?.alpha ?? true,
      premultipliedAlpha: opts?.premultipliedAlpha ?? true,
      antialias: opts?.antialias ?? true,
      depth: false,
      stencil: false,
    }
    const ctx = canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null
    if (!ctx)
      throw new WebGLUnsupportedError()
    this.gl = ctx

    // Standard premultiplied alpha blending — matches Canvas2D's default.
    this.gl.enable(this.gl.BLEND)
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA)
  }

  compileProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl
    const vs = this._compileShader(gl.VERTEX_SHADER, vertSrc)
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fragSrc)

    const program = gl.createProgram()
    if (!program)
      throw new Error('Failed to allocate WebGL program.')

    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program) ?? ''
      gl.deleteProgram(program)
      throw new Error(`WebGL program link failed: ${info}`)
    }

    // The shaders themselves are no longer needed once linked.
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    return program
  }

  _compileShader(type: GLenum, src: string): WebGLShader {
    const gl = this.gl
    const shader = gl.createShader(type)
    if (!shader)
      throw new Error('Failed to allocate WebGL shader.')
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader) ?? ''
      gl.deleteShader(shader)
      throw new Error(`WebGL shader compile failed: ${info}\n--- source ---\n${src}`)
    }
    return shader
  }

  createBuffer(data: ArrayBufferView, usage?: number): WebGLBuffer {
    const gl = this.gl
    const buf = gl.createBuffer()
    if (!buf)
      throw new Error('Failed to allocate WebGL buffer.')
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, data, usage ?? gl.STATIC_DRAW)
    return buf
  }

  resize(width: number, height: number): void {
    const canvas = this.canvas
    if (canvas.width !== width)
      canvas.width = width
    if (canvas.height !== height)
      canvas.height = height
    this.gl.viewport(0, 0, width, height)
  }

  clear(r: number, g: number, b: number, a: number): void {
    const gl = this.gl
    gl.clearColor(r, g, b, a)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }
}
