/**
 * Draws a street-level picture as seen from where it was taken.
 *
 * One quad across the canvas: each pixel casts a ray through the camera,
 * turned by where you look, and reads the picture where the ray goes. A
 * 360° picture is equirectangular (longitude across, latitude down) and is
 * read by the ray's longitude and latitude; a flat photo is read where the
 * ray meets its plane. Two pictures can be drawn at once, for the step
 * between them: the one being left zooms in as it fades, and the one
 * arrived at fades in, as Apple's Look Around moves.
 *
 * Where WebGL is not to be had, a 360° picture is a background image,
 * scrolled as you turn. Flatter, but it turns.
 */

import type { StreetImage } from './providers'
import { panoramaU } from './navigation'

export interface PanoramaView {
  /** Compass degrees you look along. */
  heading: number
  /** Degrees up (positive) or down. */
  pitch: number
  /** Vertical field of view, degrees. */
  fov: number
}

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_pos;
void main() {
  v_pos = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAGMENT = `
precision highp float;
varying vec2 v_pos;
uniform sampler2D u_from;
uniform sampler2D u_to;
// heading (radians), horizontal and vertical field of view (radians), drawn (0/1)
uniform vec4 u_fromImage;
uniform vec4 u_toImage;
// tan(fov/2) for each, the leaving picture zooming in
uniform vec2 u_zoom;
uniform float u_heading;
uniform float u_pitch;
uniform float u_aspect;
uniform float u_mix;

vec3 ray(float t) {
  vec3 d = normalize(vec3(v_pos.x * t * u_aspect, v_pos.y * t, 1.0));
  float c = cos(u_pitch);
  float s = sin(u_pitch);
  return vec3(d.x, d.y * c + d.z * s, -d.y * s + d.z * c);
}

vec4 read(sampler2D tex, vec4 image, float t) {
  vec3 d = ray(t);
  // Turned from looking along the picture's own heading.
  float a = u_heading - image.x;
  vec3 w = vec3(d.x * cos(a) + d.z * sin(a), d.y, -d.x * sin(a) + d.z * cos(a));
  if (image.y > 6.28) {
    float u = fract(atan(w.x, w.z) / 6.2831853 + 0.5);
    float v = 0.5 - asin(clamp(w.y, -1.0, 1.0)) / 3.14159265;
    return texture2D(tex, vec2(u, v));
  }
  if (w.z <= 0.0)
    return vec4(0.0, 0.0, 0.0, 1.0);
  vec2 p = w.xy / w.z;
  vec2 uv = vec2(p.x / tan(image.y * 0.5), p.y / tan(image.z * 0.5)) * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)
    return vec4(0.0, 0.0, 0.0, 1.0);
  return texture2D(tex, vec2(uv.x, 1.0 - uv.y));
}

void main() {
  vec4 to = u_toImage.w > 0.5 ? read(u_to, u_toImage, u_zoom.y) : vec4(0.0, 0.0, 0.0, 1.0);
  if (u_mix >= 1.0 || u_fromImage.w < 0.5) {
    gl_FragColor = to;
    return;
  }
  vec4 from = read(u_from, u_fromImage, u_zoom.x);
  gl_FragColor = mix(from, to, u_mix);
}
`

interface Slot {
  texture: WebGLTexture
  image?: StreetImage
  ready: boolean
}

const RAD = Math.PI / 180

export class PanoramaRenderer {
  element: HTMLElement
  canvas?: HTMLCanvasElement
  gl?: WebGLRenderingContext
  program?: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null> = {}
  slots: [Slot, Slot] | undefined
  /** The background the picture is drawn as without WebGL. */
  fallback?: HTMLElement
  current?: StreetImage
  maxTexture = 4096

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'tsmap-lookaround-view'
    parent.appendChild(this.element)
    let gl: WebGLRenderingContext | null = null
    const canvas = document.createElement('canvas')
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false }) as WebGLRenderingContext | null
    }
    catch {
      gl = null
    }
    if (gl && typeof gl.createShader === 'function' && this._compile(gl)) {
      this.canvas = canvas
      this.gl = gl
      this.element.appendChild(canvas)
      this.maxTexture = Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096)
      const texture = (): Slot => ({ texture: gl!.createTexture()!, ready: false })
      this.slots = [texture(), texture()]
    }
    else {
      this.fallback = document.createElement('div')
      this.fallback.className = 'tsmap-lookaround-fallback'
      this.element.appendChild(this.fallback)
    }
  }

  get webgl(): boolean {
    return !!this.gl
  }

  _compile(gl: WebGLRenderingContext): boolean {
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
    this.program = program
    gl.useProgram(program)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const at = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(at)
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)
    for (const name of ['u_from', 'u_to', 'u_fromImage', 'u_toImage', 'u_zoom', 'u_heading', 'u_pitch', 'u_aspect', 'u_mix'])
      this.uniforms[name] = gl.getUniformLocation(program, name)
    return true
  }

  /**
   * Show a picture once it has loaded; the picture before stays until then,
   * for the step between them. Resolves when it is showing.
   */
  async show(image: StreetImage, url: string = image.url): Promise<void> {
    if (this.fallback) {
      // The browser loads a background on its own.
      this.current = image
      this.fallback.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`
      return
    }
    const loaded = await loadImage(url)
    const gl = this.gl!
    const [from, to] = this.slots!
    // A sharper copy of the picture already showing replaces it in place.
    const slot = to.image?.id === image.id ? to : from
    const source = fitTexture(loaded, this.maxTexture)
    gl.bindTexture(gl.TEXTURE_2D, slot.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source as TexImageSource)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    slot.image = image
    slot.ready = true
    if (slot === from)
      this.slots = [to, from]
    this.current = image
  }

  /** Draw a frame. `step` from 0 to 1 is how far through the step from the last picture. */
  draw(view: PanoramaView, step: number = 1): void {
    const width = this.element.clientWidth || 1
    const height = this.element.clientHeight || 1
    if (this.fallback) {
      const image = this.current
      if (!image)
        return
      // A 360° picture is twice as wide as tall; it repeats round.
      const across = height * 2 * (75 / Math.max(20, view.fov))
      this.fallback.style.backgroundSize = `${across}px ${across / 2}px`
      const u = image.fov >= 360 ? panoramaU(image, view.heading) : 0.5
      this.fallback.style.backgroundPosition = `${width / 2 - u * across}px ${height / 2 - across / 4 - (view.pitch / 180) * (across / 2)}px`
      return
    }
    const gl = this.gl!
    const canvas = this.canvas!
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1)
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
    const [from, to] = this.slots!
    const describe = (slot: Slot): [number, number, number, number] => {
      const image = slot.image
      if (!image || !slot.ready)
        return [0, 0, 0, 0]
      const h = image.fov >= 360 ? 2 * Math.PI + 0.01 : image.fov * RAD
      // Flat photos are taken 4:3 more often than not.
      const v = image.fov >= 360 ? Math.PI : 2 * Math.atan(Math.tan(h / 2) * 0.75)
      return [image.heading * RAD, h, v, 1]
    }
    const t = Math.tan((view.fov * RAD) / 2)
    const u = this.uniforms
    gl.uniform1i(u.u_from!, 0)
    gl.uniform1i(u.u_to!, 1)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, from.texture)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, to.texture)
    gl.uniform4fv(u.u_fromImage!, describe(from))
    gl.uniform4fv(u.u_toImage!, describe(to))
    // The picture being left zooms in by up to a half as it goes.
    gl.uniform2f(u.u_zoom!, t * (1 - 0.5 * step), t)
    gl.uniform1f(u.u_heading!, view.heading * RAD)
    gl.uniform1f(u.u_pitch!, view.pitch * RAD)
    gl.uniform1f(u.u_aspect!, width / height)
    gl.uniform1f(u.u_mix!, step)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  remove(): void {
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext()
    this.element.remove()
  }
}

/** Load a picture that WebGL may read: cross-origin, so the server must allow it. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${url}`))
    image.src = url
  })
}

/** A picture no bigger than a texture may be: a 12k panorama is drawn down to fit. */
function fitTexture(image: HTMLImageElement, max: number): HTMLImageElement | HTMLCanvasElement {
  const w = image.naturalWidth || image.width
  const h = image.naturalHeight || image.height
  if (w <= max && h <= max)
    return image
  const scale = max / Math.max(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}
