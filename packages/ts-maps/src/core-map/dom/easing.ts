/**
 * Zero-dependency easing functions. Every function takes `t` in `[0, 1]` and
 * returns a value in `[0, 1]` (the `easeOutBack` variant can temporarily
 * overshoot past `1`, by design — it's the "spring-tap" feel used in button
 * micro-animations, not the default for camera moves).
 *
 * The default camera easing is `easeInOutCubic`, which matches what most
 * slippy-map libraries (Leaflet, Mapbox GL JS's `easeTo`) feel like out of
 * the box.
 */

export type EasingFunction = (t: number) => number

export function linear(t: number): number {
  return t
}

export function easeInQuad(t: number): number {
  return t * t
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
}

export function easeInCubic(t: number): number {
  return t * t * t
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
}

export function easeInQuart(t: number): number {
  return t * t * t * t
}

export function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4
}

export function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - ((-2 * t + 2) ** 4) / 2
}

/**
 * `easeOutBack` overshoots slightly past 1 before settling — useful for tiny
 * button-like pops. Do **not** use this as a camera-easing default because
 * the overshoot translates into a brief zoom past the target, which looks
 * glitchy on map moves.
 */
export function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  const x = t - 1
  return 1 + c3 * x * x * x + c1 * x * x
}

/**
 * Returns an easing function that evaluates a cubic Bezier curve with the
 * given control points at `t`. The endpoints are fixed at `(0, 0)` and
 * `(1, 1)`; `(x1, y1)` and `(x2, y2)` are the two inner control points.
 *
 * This is the same parameterization as CSS `cubic-bezier(x1, y1, x2, y2)`,
 * so `cubicBezier(0.25, 0.1, 0.25, 1)` reproduces the CSS `ease` curve.
 *
 * Newton-Raphson is used to find the Bezier parameter `s` that matches the
 * requested `x = t`. We cap iteration to 10 with an epsilon of 1e-5, which
 * is plenty for frame-rate-driven animation.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
  // Polynomial coefficients: B(s) = 3(1-s)^2 s P1 + 3(1-s) s^2 P2 + s^3
  const ax = 3 * x1 - 3 * x2 + 1
  const bx = -6 * x1 + 3 * x2
  const cx = 3 * x1
  const ay = 3 * y1 - 3 * y2 + 1
  const by = -6 * y1 + 3 * y2
  const cy = 3 * y1

  const sampleX = (s: number): number => ((ax * s + bx) * s + cx) * s
  const sampleY = (s: number): number => ((ay * s + by) * s + cy) * s
  const sampleDerivX = (s: number): number => (3 * ax * s + 2 * bx) * s + cx

  return function evaluate(t: number): number {
    if (t <= 0)
      return 0
    if (t >= 1)
      return 1

    // Newton-Raphson on sampleX(s) = t, starting from s = t.
    let s = t
    for (let i = 0; i < 10; i++) {
      const xEst = sampleX(s) - t
      if (Math.abs(xEst) < 1e-5)
        return sampleY(s)
      const d = sampleDerivX(s)
      if (Math.abs(d) < 1e-6)
        break
      s -= xEst / d
    }
    return sampleY(s)
  }
}
