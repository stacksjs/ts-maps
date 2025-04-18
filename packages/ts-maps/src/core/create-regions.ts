import type { MapInterface, Region as RegionType } from '../types'
import Region from '../components/region'
import { merge } from '../util'

export default function createRegions(this: MapInterface): void {
  this._regionLabelsGroup = this._regionLabelsGroup || this.canvas.createGroup('jvm-regions-labels-group')

  for (const code in this._mapData.paths) {
    const region = new Region({
      map: this,
      code,
      path: this._mapData.paths[code].path,
      style: merge({ initial: {} }, this.params.regionStyle || {}),
      labelStyle: this.params.regionLabelStyle,
      labelsGroup: this._regionLabelsGroup,
      label: this.params.labels?.regions ? {} : undefined,
    })

    this.regions[code] = {
      config: this._mapData.paths[code],
      element: region,
      path: this._mapData.paths[code].path,
      name: code,
    } as RegionType
  }
}
