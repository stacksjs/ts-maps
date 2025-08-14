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

  // Early return if insets is undefined or empty
  if (!insets || insets.length === 0) {
    return undefined
  }

  for (let index = 0; index < insets.length; index++) {
    const inset = insets[index]

    // Skip if inset or bbox is undefined
    if (!inset || !inset.bbox || inset.bbox.length < 2) {
      continue
    }

    const [start, end] = inset.bbox

    // Skip if start or end points are undefined
    if (!start || !end) {
      continue
    }

    if (x > start.x && x < end.x && y > start.y && y < end.y) {
      return inset
    }
  }

  return undefined
}
