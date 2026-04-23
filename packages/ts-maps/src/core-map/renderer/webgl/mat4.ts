// Minimal 4x4 matrix utilities (column-major, GLSL-compatible).
//
// Just the operations the WebGL renderer needs: identity, ortho, translate,
// scale, rotateZ, multiply. A deliberate dependency-free subset; behaviour
// mirrors the equivalent `gl-matrix` entry points so callers familiar with
// that library stay oriented.

export type Mat4 = Float32Array

export function identity(out?: Mat4): Mat4 {
  const m = out ?? new Float32Array(16)
  m[0] = 1
  m[1] = 0
  m[2] = 0
  m[3] = 0
  m[4] = 0
  m[5] = 1
  m[6] = 0
  m[7] = 0
  m[8] = 0
  m[9] = 0
  m[10] = 1
  m[11] = 0
  m[12] = 0
  m[13] = 0
  m[14] = 0
  m[15] = 1
  return m
}

// Build an orthographic projection matrix. Column-major to match WebGL.
export function ortho(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
  out?: Mat4,
): Mat4 {
  const m = out ?? new Float32Array(16)
  const lr = 1 / (left - right)
  const bt = 1 / (bottom - top)
  const nf = 1 / (near - far)
  m[0] = -2 * lr
  m[1] = 0
  m[2] = 0
  m[3] = 0
  m[4] = 0
  m[5] = -2 * bt
  m[6] = 0
  m[7] = 0
  m[8] = 0
  m[9] = 0
  m[10] = 2 * nf
  m[11] = 0
  m[12] = (left + right) * lr
  m[13] = (top + bottom) * bt
  m[14] = (far + near) * nf
  m[15] = 1
  return m
}

export function translate(out: Mat4, a: Mat4, x: number, y: number, z: number): Mat4 {
  if (out === a) {
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12]
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13]
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14]
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15]
    return out
  }
  for (let i = 0; i < 12; i++) out[i] = a[i]
  out[12] = a[0] * x + a[4] * y + a[8] * z + a[12]
  out[13] = a[1] * x + a[5] * y + a[9] * z + a[13]
  out[14] = a[2] * x + a[6] * y + a[10] * z + a[14]
  out[15] = a[3] * x + a[7] * y + a[11] * z + a[15]
  return out
}

export function scale(out: Mat4, a: Mat4, x: number, y: number, z: number): Mat4 {
  out[0] = a[0] * x
  out[1] = a[1] * x
  out[2] = a[2] * x
  out[3] = a[3] * x
  out[4] = a[4] * y
  out[5] = a[5] * y
  out[6] = a[6] * y
  out[7] = a[7] * y
  out[8] = a[8] * z
  out[9] = a[9] * z
  out[10] = a[10] * z
  out[11] = a[11] * z
  out[12] = a[12]
  out[13] = a[13]
  out[14] = a[14]
  out[15] = a[15]
  return out
}

export function rotateZ(out: Mat4, a: Mat4, rad: number): Mat4 {
  const s = Math.sin(rad)
  const c = Math.cos(rad)
  const a00 = a[0]
  const a01 = a[1]
  const a02 = a[2]
  const a03 = a[3]
  const a10 = a[4]
  const a11 = a[5]
  const a12 = a[6]
  const a13 = a[7]

  if (out !== a) {
    out[8] = a[8]
    out[9] = a[9]
    out[10] = a[10]
    out[11] = a[11]
    out[12] = a[12]
    out[13] = a[13]
    out[14] = a[14]
    out[15] = a[15]
  }

  out[0] = a00 * c + a10 * s
  out[1] = a01 * c + a11 * s
  out[2] = a02 * c + a12 * s
  out[3] = a03 * c + a13 * s
  out[4] = a10 * c - a00 * s
  out[5] = a11 * c - a01 * s
  out[6] = a12 * c - a02 * s
  out[7] = a13 * c - a03 * s
  return out
}

export function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0]
  const a01 = a[1]
  const a02 = a[2]
  const a03 = a[3]
  const a10 = a[4]
  const a11 = a[5]
  const a12 = a[6]
  const a13 = a[7]
  const a20 = a[8]
  const a21 = a[9]
  const a22 = a[10]
  const a23 = a[11]
  const a30 = a[12]
  const a31 = a[13]
  const a32 = a[14]
  const a33 = a[15]

  let b0 = b[0]
  let b1 = b[1]
  let b2 = b[2]
  let b3 = b[3]
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[4]
  b1 = b[5]
  b2 = b[6]
  b3 = b[7]
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[8]
  b1 = b[9]
  b2 = b[10]
  b3 = b[11]
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[12]
  b1 = b[13]
  b2 = b[14]
  b3 = b[15]
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  return out
}
