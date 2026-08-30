// Geodesic area.
//
// A territory game's whole economy is measured in square metres, so this is
// not a place for the flat approximation. Projecting to Web Mercator and
// measuring there inflates area by `1 / cos²(latitude)` — about 1.7× at 40°,
// over 4× at 60° — which would make the same lap around a park worth twice as
// much in Stockholm as in Barcelona.
//
// The formula below measures on the sphere instead, so a loop is worth what it
// is worth wherever it was run.

/** Mean Earth radius in metres, as WGS 84 defines it. */
export const EARTH_RADIUS = 6371008.8

export type Position = [number, number] | number[]
export type Ring = Position[]
export type Polygon = Ring[]
export type MultiPolygon = Polygon[]

const RAD = Math.PI / 180

/**
 * Signed area of one ring in square metres, positive when it winds
 * counter-clockwise.
 *
 * Signed rather than absolute because the sign is what distinguishes a hole
 * from an outer ring, and a territory with a lake in it is a shape this has to
 * measure correctly.
 *
 * Coordinates are `[longitude, latitude]`, the order GeoJSON uses.
 */
export function ringArea(ring: Ring): number {
  if (ring.length < 3)
    return 0

  // Spherical excess, in the form used for polygons on a sphere: each edge
  // contributes the area of the wedge between it and the meridian, and the
  // contributions cancel except over the enclosed region.
  let total = 0
  for (let i = 0, len = ring.length; i < len; i++) {
    const p1 = ring[i]
    const p2 = ring[(i + 1) % len]
    // The longitude difference is taken the short way round. A ring crossing
    // the antimeridian is recorded as a jump from 179.99 to -179.99, and read
    // literally that edge spans the planet — a strip a few metres wide off
    // Fiji would measure as forty billion square metres. No legitimate edge
    // spans more than half the world, so the shorter way is always the one
    // that was run.
    let dLng = p2[0] - p1[0]
    if (dLng > 180)
      dLng -= 360
    else if (dLng < -180)
      dLng += 360
    total += dLng * RAD * (2 + Math.sin(p1[1] * RAD) + Math.sin(p2[1] * RAD))
  }

  return (total * EARTH_RADIUS * EARTH_RADIUS) / 2
}

/**
 * Area of a polygon in square metres: its outer ring less its holes.
 *
 * Ring winding is not trusted — a track recorded by a runner going clockwise
 * is as valid as one going the other way, and GeoJSON from the wild is
 * inconsistent about it. The first ring is taken as the outer one and the rest
 * as holes, which is what the GeoJSON specification says they are.
 */
export function polygonArea(polygon: Polygon): number {
  if (polygon.length === 0)
    return 0

  let total = Math.abs(ringArea(polygon[0]))
  for (let i = 1; i < polygon.length; i++)
    total -= Math.abs(ringArea(polygon[i]))

  return Math.max(0, total)
}

/** Area of a multipolygon in square metres. */
export function multiPolygonArea(multi: MultiPolygon): number {
  let total = 0
  for (const polygon of multi)
    total += polygonArea(polygon)
  return total
}

/**
 * Perimeter of a ring in metres.
 *
 * Useful next to the area: two territories of the same size but very different
 * perimeters were earned by quite different runs.
 */
export function ringPerimeter(ring: Ring, closed = true): number {
  let total = 0
  const end = closed ? ring.length : ring.length - 1
  for (let i = 0; i < end; i++)
    total += haversine(ring[i], ring[(i + 1) % ring.length])
  return total
}

/** Great-circle distance between two `[lng, lat]` positions, in metres. */
export function haversine(a: Position, b: Position): number {
  const dLat = (b[1] - a[1]) * RAD
  const dLng = (b[0] - a[0]) * RAD
  const lat1 = a[1] * RAD
  const lat2 = b[1] * RAD

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface FormatAreaOptions {
  /**
   * Metric or imperial. Defaults to metric — a running app usually follows the
   * viewer's locale, and the caller knows it and this does not.
   */
  units?: 'metric' | 'imperial'
  /** Locale for the number itself. Defaults to the runtime's. */
  locale?: string
}

/**
 * Square metres as something to put on a screen.
 *
 * The unit is chosen for the magnitude, because a territory game spans four
 * orders of it: a small block is a few thousand square metres, a good long run
 * encloses a couple of square kilometres, and "0.004 km²" tells a player
 * nothing they can feel.
 */
export function formatArea(squareMetres: number, options: FormatAreaOptions = {}): string {
  const locale = options.locale
  const value = Math.max(0, squareMetres)

  if (options.units === 'imperial') {
    const squareFeet = value * 10.763910417
    if (squareFeet < 43560)
      return `${round(squareFeet, 0).toLocaleString(locale)} ft²`
    const acres = value / 4046.8564224
    if (acres < 640)
      return `${round(acres, acres < 10 ? 2 : 1).toLocaleString(locale)} acres`
    return `${round(value / 2589988.110336, 2).toLocaleString(locale)} mi²`
  }

  if (value < 10000)
    return `${round(value, 0).toLocaleString(locale)} m²`
  if (value < 1000000)
    return `${round(value / 10000, value < 100000 ? 2 : 1).toLocaleString(locale)} ha`
  return `${round(value / 1000000, value < 10000000 ? 2 : 1).toLocaleString(locale)} km²`
}

/** Metres as something to put on a screen. */
export function formatDistance(metres: number, options: FormatAreaOptions = {}): string {
  const locale = options.locale
  const value = Math.max(0, metres)

  if (options.units === 'imperial') {
    const miles = value / 1609.344
    if (miles < 0.1)
      return `${round(value * 3.280839895, 0).toLocaleString(locale)} ft`
    return `${round(miles, 2).toLocaleString(locale)} mi`
  }

  if (value < 1000)
    return `${round(value, 0).toLocaleString(locale)} m`
  return `${round(value / 1000, 2).toLocaleString(locale)} km`
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}
