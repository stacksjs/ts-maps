import type { FocusOnOptions, MapInterface } from '../types'

interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export default function setFocus(this: MapInterface, config: FocusOnOptions = {}): void {
  let bbox: BBox | undefined
  let codes: string[] = []

  if (config.region) {
    codes.push(config.region)
  }
  else if (config.regions) {
    codes = config.regions
  }

  if (codes.length) {
    codes.forEach((code) => {
      if (this.regions[code]) {
        const itemBbox = this.regions[code].element.shape.getBBox()

        if (itemBbox) {
          // Handle the first loop
          if (typeof bbox === 'undefined') {
            bbox = itemBbox
          }
          else {
            // get the old bbox properties plus the current
            // this kinda incrementing the old values and the new values
            bbox = {
              x: Math.min(bbox.x, itemBbox.x),
              y: Math.min(bbox.y, itemBbox.y),
              width: Math.max(bbox.x + bbox.width, itemBbox.x + itemBbox.width) - Math.min(bbox.x, itemBbox.x),
              height: Math.max(bbox.y + bbox.height, itemBbox.y + itemBbox.height) - Math.min(bbox.y, itemBbox.y),
            }
          }
        }
      }
    })

    if (bbox) {
      return this._setScale(
        Math.min(this._width / bbox.width, this._height / bbox.height),
        -(bbox.x + bbox.width / 2),
        -(bbox.y + bbox.height / 2),
        true,
        config.animate,
      )
    }
  }
  else if (config.coords) {
    const point = this.coordsToPoint(config.coords[0], config.coords[1])
    if (point) {
      const x = this.transX - point.x / this.scale
      const y = this.transY - point.y / this.scale
      return this._setScale(config.scale ? config.scale * this._baseScale : this._baseScale, x, y, true, config.animate)
    }
  }
}
