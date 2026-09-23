// Measuring a drawn path: its length, a thinned copy for elevation lookups,
// and how much it climbs.

import type { LatLngLike } from './types'

const EARTH_RADIUS_M = 6_371_008.8

/** Great-circle distance between two points, in metres. */
export function distanceMeters(a: LatLngLike, b: LatLngLike): number {
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLng = (b.lng - a.lng) * toRad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Length of a path, in metres. */
export function pathLengthMeters(points: LatLngLike[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++)
    total += distanceMeters(points[i - 1], points[i])
  return total
}

/**
 * At most `maxPoints` points spaced evenly by distance along the path, first
 * and last kept. An elevation service charges per point and a routed path
 * can carry thousands; a climb figure needs a few hundred.
 */
export function resamplePath(points: LatLngLike[], maxPoints: number): LatLngLike[] {
  if (points.length <= maxPoints || maxPoints < 2)
    return points.slice()
  const total = pathLengthMeters(points)
  if (total === 0)
    return [points[0], points[points.length - 1]]
  const step = total / (maxPoints - 1)
  const out: LatLngLike[] = [points[0]]
  let travelled = 0
  let next = step
  for (let i = 1; i < points.length && out.length < maxPoints - 1; i++) {
    const a = points[i - 1]
    const b = points[i]
    const seg = distanceMeters(a, b)
    while (seg > 0 && travelled + seg >= next && out.length < maxPoints - 1) {
      const t = (next - travelled) / seg
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })
      next += step
    }
    travelled += seg
  }
  out.push(points[points.length - 1])
  return out
}

export interface Climb {
  /** Metres gained. */
  gain: number
  /** Metres lost. */
  loss: number
}

/**
 * Total ascent and descent along a height profile.
 *
 * Changes smaller than `noiseFloor` metres are held until they add up to
 * more: DEM heights wobble by a metre or two between neighbouring samples,
 * and summing every wobble turns a flat beach path into a hill. Missing
 * heights (null) are skipped, not read as sea level.
 */
export function climb(heights: Array<number | null>, noiseFloor: number = 3): Climb {
  let gain = 0
  let loss = 0
  let anchor: number | null = null
  for (const h of heights) {
    if (h === null || !Number.isFinite(h))
      continue
    if (anchor === null) {
      anchor = h
      continue
    }
    const delta = h - anchor
    if (delta >= noiseFloor) {
      gain += delta
      anchor = h
    }
    else if (delta <= -noiseFloor) {
      loss -= delta
      anchor = h
    }
  }
  return { gain, loss }
}
