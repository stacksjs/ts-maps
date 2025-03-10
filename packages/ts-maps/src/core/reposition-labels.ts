import type { MapInterface } from '../types'

export default function repositionLabels(this: MapInterface): void {
  const labels = this.params.labels || {}

  // Regions labels
  if (labels.regions) {
    for (const code in this.regions) {
      const region = this.regions[code] as any
      if (region.label) {
        // Ensure coordinates are valid numbers
        const x = region.labelX * this.scale + this.transX * this.scale
        const y = region.labelY * this.scale + this.transY * this.scale

        // Set position with valid numbers
        region.label.set({
          x: Number.isNaN(x) ? 0 : x,
          y: Number.isNaN(y) ? 0 : y,
        })
      }
    }
  }

  // Markers labels
  if (labels.markers) {
    for (const index in this._markers) {
      const marker = this._markers[index] as any
      if (marker && typeof marker.updateLabelPosition === 'function') {
        marker.updateLabelPosition()
      }
    }
  }
}
