/**
 * Moving through Look Around: which picture is ahead, which behind, and
 * which way a picture shows a direction.
 *
 * Kept apart from the viewer and free of the DOM, so the choices can be
 * tested without one.
 */

import type { StreetImage } from './providers'
import { metresBetween } from './providers'

/** Compass degrees from a to b. */
export function bearingBetween(a: { lat: number, lng: number }, b: { lat: number, lng: number }): number {
  const rad = Math.PI / 180
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad)
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad)
  return normalizeHeading(Math.atan2(y, x) / rad)
}

/** Degrees into [0, 360). */
export function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** The turn from one heading to another, in (-180, 180]. */
export function turnBetween(from: number, to: number): number {
  const d = normalizeHeading(to - from)
  return d > 180 ? d - 360 : d
}

export interface StepOptions {
  /** Closer than this is the same spot. Default 2 m. */
  minDistance?: number
  /** Further than this is not a step. Default 30 m. */
  maxDistance?: number
  /** How far off the way you look a step may be. Default 50°. */
  spread?: number
}

/**
 * The picture to step to, looking `heading` from `current`: the nearest one
 * in that direction, preferring the next or previous in the same sequence,
 * which is the same street.
 */
export function stepToward(current: StreetImage, candidates: readonly StreetImage[], heading: number, options: StepOptions = {}): StreetImage | undefined {
  const min = options.minDistance ?? 2
  const max = options.maxDistance ?? 30
  const spread = options.spread ?? 50
  let best: StreetImage | undefined
  let score = Infinity
  for (const image of candidates) {
    if (image.id === current.id)
      continue
    const distance = metresBetween(current, image)
    if (distance < min || distance > max)
      continue
    const off = Math.abs(turnBetween(heading, bearingBetween(current, image)))
    if (off > spread)
      continue
    // Distance, plus a metre for every few degrees off; its own street's
    // neighbours count as if a few metres nearer.
    const linked = image.id === current.next || image.id === current.prev || (!!current.sequence && image.sequence === current.sequence)
    const s = distance + off / 5 - (linked ? 4 : 0)
    if (s < score) {
      score = s
      best = image
    }
  }
  return best
}

/** Where each way leads from a picture: forward and back along the way you look, and to either side. */
export function stepsFrom(current: StreetImage, candidates: readonly StreetImage[], heading: number, options: StepOptions = {}): { forward?: StreetImage, back?: StreetImage, left?: StreetImage, right?: StreetImage } {
  return {
    forward: stepToward(current, candidates, heading, options),
    back: stepToward(current, candidates, heading + 180, options),
    left: stepToward(current, candidates, heading - 90, options),
    right: stepToward(current, candidates, heading + 90, options),
  }
}

/**
 * Where a compass heading falls across a 360° picture, 0 to 1 from its left
 * edge: the middle of the picture faces its `heading`.
 */
export function panoramaU(image: Pick<StreetImage, 'heading'>, heading: number): number {
  return normalizeHeading(heading - image.heading + 180) / 360
}

/** The heading to look along to face a place from a picture. */
export function headingToward(image: { lat: number, lng: number }, place: { lat: number, lng: number }): number {
  return bearingBetween(image, place)
}
