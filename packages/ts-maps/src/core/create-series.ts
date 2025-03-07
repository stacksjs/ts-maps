import type { MapInterface, SeriesConfig } from '../types'
import Series from '../series'

type SeriesKey = 'markers' | 'regions'

export default function createSeries(this: MapInterface): void {
  this.series = { markers: [], regions: [] }

  for (const key in this.params.series) {
    const seriesKey = key as SeriesKey
    if (this.params.series[seriesKey]) {
      for (let i = 0; i < this.params.series[seriesKey].length; i++) {
        this.series[seriesKey][i] = new Series(
          this.params.series[seriesKey][i],
          seriesKey === 'markers' ? (this._markers || {}) : this.regions,
          this,
        )
      }
    }
  }
}
