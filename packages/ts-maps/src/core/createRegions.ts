import Region from '../components/region'
import { merge } from '../util'

export default function createRegions() {
  this._regionLabelsGroup = this._regionLabelsGroup || this.canvas.createGroup('jvm-regions-labels-group')

  for (const code in this._mapData.paths) {
    const region = new Region({
      map: this,
      code,
      path: this._mapData.paths[code].path,
      style: merge({}, this.params.regionStyle),
      labelStyle: this.params.regionLabelStyle,
      labelsGroup: this._regionLabelsGroup,
      label: this.params.labels && this.params.labels.regions,
    })

    this.regions[code] = {
      config: this._mapData.paths[code],
      element: region,
    }
  }
}
