import type { MapInterface } from '../types'

export default function repositionMarkers(this: MapInterface): void {
  if (!this._markers)
    return

  for (const index in this._markers) {
    const marker = this._markers[index]
    if (!marker)
      continue

    const point = this.getMarkerPosition(marker.config)

    if (point !== false) {
      marker.element.setStyle('cx', point.x)
      marker.element.setStyle('cy', point.y)
    }
  }
}
