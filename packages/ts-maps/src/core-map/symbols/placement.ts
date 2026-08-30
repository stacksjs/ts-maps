// Symbol placement geometry.
//
// Pure functions, deliberately: placement is the part of label rendering most
// worth testing, and it is untestable if it only exists inside a canvas draw
// call. Everything here works in whatever pixel space the caller hands it.

export type TextAnchor
  = | 'center'
    | 'left'
    | 'right'
    | 'top'
    | 'bottom'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'

export interface Vec {
  x: number
  y: number
}

/**
 * Where the text box's top-left corner goes, relative to the anchor point.
 *
 * `text-anchor` names the part of the label that touches the anchor, so
 * `'left'` puts the label's left edge on the point and the text runs to the
 * right — the opposite of what the name suggests at first glance.
 */
export function anchorOffset(anchor: TextAnchor, width: number, height: number): Vec {
  let x: number
  let y: number

  switch (anchor) {
    case 'left':
    case 'top-left':
    case 'bottom-left':
      x = 0
      break
    case 'right':
    case 'top-right':
    case 'bottom-right':
      x = -width
      break
    default:
      x = -width / 2
  }

  switch (anchor) {
    case 'top':
    case 'top-left':
    case 'top-right':
      y = 0
      break
    case 'bottom':
    case 'bottom-left':
    case 'bottom-right':
      y = -height
      break
    default:
      y = -height / 2
  }

  return { x, y }
}

/** Normalise `text-offset` (ems, [x, y]) into pixels at a given text size. */
export function offsetPixels(offset: unknown, textSize: number): Vec {
  if (!Array.isArray(offset) || offset.length < 2)
    return { x: 0, y: 0 }
  const x = Number(offset[0])
  const y = Number(offset[1])
  return {
    x: Number.isFinite(x) ? x * textSize : 0,
    y: Number.isFinite(y) ? y * textSize : 0,
  }
}

/**
 * The axis-aligned box covering a rectangle rotated about a point.
 *
 * Collision uses axis-aligned boxes, so a rotated label needs the bounds of
 * its rotated corners rather than its unrotated ones — otherwise a label at
 * 45° reserves a box far smaller than the ink it actually lays down.
 */
export function rotatedBounds(x: number, y: number, width: number, height: number, angle: number, originX: number = x, originY: number = y): { minX: number, minY: number, maxX: number, maxY: number } {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const corners: Vec[] = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ]

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const corner of corners) {
    const dx = corner.x - originX
    const dy = corner.y - originY
    const rx = originX + dx * cos - dy * sin
    const ry = originY + dx * sin + dy * cos
    if (rx < minX) minX = rx
    if (ry < minY) minY = ry
    if (rx > maxX) maxX = rx
    if (ry > maxY) maxY = ry
  }

  return { minX, minY, maxX, maxY }
}

export interface PlacedGlyph {
  /** Baseline origin of the glyph. */
  x: number
  y: number
  /** Rotation in radians, tangent to the line at this point. */
  angle: number
  /** Index into the advances array this placement came from. */
  index: number
}

export interface LinePlacementOptions {
  /** Per-glyph horizontal advances, in the same pixel space as the line. */
  advances: number[]
  /** Distance along the line at which the label's first glyph starts. */
  start: number
  /**
   * Largest angle change, in degrees, tolerated between the first and last
   * glyph of the label. Text that bends more than this is unreadable and is
   * better dropped than drawn. Mapbox's default is 45.
   */
  maxAngle?: number
  /**
   * Flip a label that would otherwise read right-to-left. Street names should
   * never appear upside-down just because the geometry was digitised the other
   * way. Default true.
   */
  keepUpright?: boolean
}

/** Total length of a polyline. */
export function lineLength(line: Vec[]): number {
  let total = 0
  for (let i = 1; i < line.length; i++) {
    const dx = line[i]!.x - line[i - 1]!.x
    const dy = line[i]!.y - line[i - 1]!.y
    total += Math.hypot(dx, dy)
  }
  return total
}

/** The point and tangent angle at a distance along a polyline, or null past its end. */
export function pointAtDistance(line: Vec[], distance: number): (Vec & { angle: number }) | null {
  if (line.length < 2 || distance < 0)
    return null

  let travelled = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!
    const b = line[i]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const segment = Math.hypot(dx, dy)
    if (segment === 0)
      continue

    if (travelled + segment >= distance) {
      const t = (distance - travelled) / segment
      return { x: a.x + dx * t, y: a.y + dy * t, angle: Math.atan2(dy, dx) }
    }
    travelled += segment
  }
  return null
}

/**
 * Lay glyphs along a line, one per advance, each rotated to the local tangent.
 *
 * Returns null when the label does not fit, or bends past `maxAngle` — both
 * are "don't draw this here" answers, and the caller is expected to try the
 * next candidate position rather than force it.
 */
export function placeGlyphsAlongLine(line: Vec[], options: LinePlacementOptions): PlacedGlyph[] | null {
  const { advances, start } = options
  if (!advances.length || line.length < 2)
    return null

  const maxAngle = ((options.maxAngle ?? 45) * Math.PI) / 180
  const total = advances.reduce((sum, a) => sum + a, 0)
  if (start + total > lineLength(line))
    return null

  // Direction is decided once, from the label's span as a whole: deciding per
  // glyph would let a label flip halfway through a curve.
  let flip = false
  if (options.keepUpright !== false) {
    const from = pointAtDistance(line, start)
    const to = pointAtDistance(line, start + total)
    if (from && to && to.x < from.x)
      flip = true
  }

  const placed: PlacedGlyph[] = []
  let cursor = start
  let firstAngle: number | null = null

  for (let i = 0; i < advances.length; i++) {
    const index = flip ? advances.length - 1 - i : i
    const advance = advances[index]!
    const at = pointAtDistance(line, cursor + advance / 2)
    if (!at)
      return null

    const angle = flip ? at.angle + Math.PI : at.angle
    if (firstAngle === null) {
      firstAngle = angle
    }
    else {
      // Signed difference wrapped to [-π, π], so a label crossing due-west
      // isn't rejected for the 2π discontinuity.
      const delta = Math.abs(((angle - firstAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
      if (delta > maxAngle)
        return null
    }

    // The glyph is drawn from its own left edge, so step back half an advance
    // from the sample point taken at the glyph's centre.
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    placed.push({
      x: at.x - cos * (advance / 2),
      y: at.y - sin * (advance / 2),
      angle,
      index,
    })
    cursor += advance
  }

  return flip ? placed.reverse() : placed
}

/**
 * Distances along a line at which to attempt a repeated label.
 *
 * A long road gets its name several times rather than once in the middle,
 * which is what makes a street findable when only part of it is on screen.
 */
export function repeatDistances(length: number, labelWidth: number, spacing: number): number[] {
  const usable = length - labelWidth
  if (usable < 0)
    return []
  // Centre the single placement when the line is too short to repeat.
  if (spacing <= 0 || usable < spacing)
    return [usable / 2]

  const distances: number[] = []
  for (let d = spacing / 2; d <= usable; d += spacing)
    distances.push(d)
  return distances.length ? distances : [usable / 2]
}
