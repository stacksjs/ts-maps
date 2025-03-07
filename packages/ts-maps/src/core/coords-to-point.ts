import type { MapInterface } from '../types'
import Map from '../map'
import Proj from '../projection'

interface Point {
  x: number
  y: number
}

/**
 * Convert latitude and longitude to point coordinates
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns Point coordinates or false if the point is outside the map
 */
export default function coordsToPoint(this: MapInterface, lat: number, lng: number): Point | false {
  const projection = this.params.map?.projection || 'mercator'
  const coords = projection === 'mercator' ? this.mercator.convert(lat, lng) : this.miller.convert(lat, lng)

  if (coords === false) {
    return false
  }

  const inset = this.getInsetForPoint(coords.x, coords.y)
  if (!inset) {
    return false
  }

  const x = inset.leftLng + ((coords.x - inset.leftLng) / (inset.rightLng - inset.leftLng)) * inset.width
  const y = inset.topLat + ((coords.y - inset.topLat) / (inset.bottomLat - inset.topLat)) * inset.height

  return {
    x,
    y,
  }
}
