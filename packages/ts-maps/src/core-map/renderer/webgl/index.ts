// Public barrel for the WebGL renderer. Exposes the tile renderer, the
// GLContext helper, the typed unsupported-error, and the 4x4 matrix utils so
// callers can construct their own projection matrices.

export { GLContext, WebGLUnsupportedError } from './GLContext'
export type { GLContextOptions } from './GLContext'
export type { CircleOptions, LineOptions } from './WebGLTileRenderer'
export { WebGLTileRenderer } from './WebGLTileRenderer'
export * as mat4 from './mat4'
export type { Mat4 } from './mat4'
