import type { MapInterface, MarkerConfig } from '../types'
import Map from '../map'

interface Point {
  x: number
  y: number
}

export default function getMarkerPosition(this: MapInterface, { coords }: MarkerConfig): Point | false {
  if (Map.maps[this.params.map.name].projection) {
    return this.coordsToPoint(...coords)
  }

  return {
    x: coords[0] * this.scale + this.transX * this.scale,
    y: coords[1] * this.scale + this.transY * this.scale,
  }
}
