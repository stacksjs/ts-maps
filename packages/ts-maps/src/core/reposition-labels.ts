import type { MapInterface } from '../types'

export default function repositionLabels(this: MapInterface): void {
  const labels = this.params.labels || {}

  // Regions labels
  if (labels.regions) {
    for (const code in this.regions) {
      const region = this.regions[code] as any

      if (!region || !region.element || !region.element.label) {
        continue
      }
      region.element.updateLabelPosition()
    }
  }

  // Markers labels
  if (labels.markers) {
    for (const index in this._markers) {
      const marker = this._markers[index] as any
      if (marker.element && typeof marker.element.updateLabelPosition === 'function') {
        marker.element.updateLabelPosition()
      }
    }
  }
}
