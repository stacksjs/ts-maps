import type { MapInterface } from '../types'

export default function repositionLabels(this: MapInterface): void {
  const labels = this.params.labels

  if (!labels) {
    return
  }

  // Regions labels
  if (labels.regions) {
    for (const key in this.regions) {
      this.regions[key].element.updateLabelPosition()
    }
  }

  // Markers labels
  if (labels.markers) {
    for (const key in this._markers || {}) {
      this._markers?.[key].element.updateLabelPosition()
    }
  }
}
