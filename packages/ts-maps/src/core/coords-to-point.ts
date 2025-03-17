import type { MapInterface } from '../types'

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

  const { bbox } = inset

  const x = (coords.x - bbox[0].x) / (bbox[1].x - bbox[0].x) * inset.width * this.scale
  const y = (coords.y - bbox[0].y) / (bbox[1].y - bbox[0].y) * inset.height * this.scale

  return {
    x: x + this.transX * this.scale + inset.left * this.scale,
    y: y + this.transY * this.scale + inset.top * this.scale,
  }
}
