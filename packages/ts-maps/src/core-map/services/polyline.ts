// Encoded polylines, as Google, OSRM, Valhalla and OpenTripPlanner send
// route shapes: precision 5 by default, 6 for Valhalla and OSRM's
// `polyline6`.

import type { LatLngLike } from './types'

/** The points of an encoded polyline. */
export function decodePolyline(encoded: string, precision: number = 5): LatLngLike[] {
  const factor = 10 ** precision
  const len = encoded.length
  let index = 0
  let lat = 0
  let lng = 0
  const out: LatLngLike[] = []
  const next = (): number => {
    let shift = 0
    let result = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1F) << shift
      shift += 5
    } while (byte >= 0x20)
    return (result & 1) ? ~(result >> 1) : (result >> 1)
  }
  while (index < len) {
    lat += next()
    lng += next()
    out.push({ lat: lat / factor, lng: lng / factor })
  }
  return out
}

/** Points as an encoded polyline, for a service that takes one. */
export function encodePolyline(points: readonly LatLngLike[], precision: number = 5): string {
  const factor = 10 ** precision
  let out = ''
  let lat = 0
  let lng = 0
  const write = (delta: number): void => {
    let value = delta < 0 ? ~(delta << 1) : delta << 1
    while (value >= 0x20) {
      out += String.fromCharCode((0x20 | (value & 0x1F)) + 63)
      value >>= 5
    }
    out += String.fromCharCode(value + 63)
  }
  for (const p of points) {
    const y = Math.round(p.lat * factor)
    const x = Math.round(p.lng * factor)
    write(y - lat)
    write(x - lng)
    lat = y
    lng = x
  }
  return out
}
