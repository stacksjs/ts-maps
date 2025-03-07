import type { MapInterface } from '../types'
import Map from '../map'

interface Point {
  x: number
  y: number
}

interface Inset {
  bbox: [Point, Point]
  width: number
  height: number
  left: number
  top: number
  [key: string]: any
}

export default function getInsetForPoint(this: MapInterface, x: number, y: number): Inset | undefined {
  const insets = Map.maps[this.params.map.name].insets

  for (let index = 0; index < insets.length; index++) {
    const [start, end] = insets[index].bbox

    if (x > start.x && x < end.x && y > start.y && y < end.y) {
      return insets[index]
    }
  }
}
