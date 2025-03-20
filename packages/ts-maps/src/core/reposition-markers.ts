import type { MapInterface } from '../types'

export default function repositionMarkers(this: MapInterface): void {
  if (!this._markers)
    return

  for (const index in this._markers) {
    const marker = this._markers[index] as any

    if (!marker || !marker.element || !marker.element.shape)
      continue

    const point = this.getMarkerPosition(marker.config)

    if (point !== false) {
      // Ensure point coordinates are valid numbers
      const cx = Number.isNaN(point.x) ? 0 : point.x
      const cy = Number.isNaN(point.y) ? 0 : point.y

      // Update marker position through its shape property
      marker.element.shape.set({
        cx,
        cy,
      })
    }
  }
}
