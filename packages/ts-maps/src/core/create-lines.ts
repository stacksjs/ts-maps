import type { LineConfig, MapInterface } from '../types'
import Line from '../components/line'
import { getLineUid, merge } from '../util'

export default function createLines(this: MapInterface, lines: LineConfig[]): void {
  const markers = this._markers || {}
  const { style, elements: _, ...rest } = this.params.lines || {}

  let point1: { x: number, y: number } | false = false
  let point2: { x: number, y: number } | false = false

  for (const index in lines) {
    const lineConfig = lines[index]

    for (const { config: markerConfig } of Object.values(markers)) {
      if (markerConfig.name === lineConfig.from) {
        point1 = this.getMarkerPosition(markerConfig)
      }

      if (markerConfig.name === lineConfig.to) {
        point2 = this.getMarkerPosition(markerConfig)
      }
    }

    if (point1 !== false && point2 !== false) {
      // Register lines with unique keys
      this._lines = this._lines || {}
      this._lines[getLineUid(lineConfig.from, lineConfig.to)] = new Line(
        {
          index,
          map: this,
          group: this._linesGroup,
          config: lineConfig,
          x1: point1.x,
          y1: point1.y,
          x2: point2.x,
          y2: point2.y,
          ...rest,
        },
        merge({ initial: style }, { initial: lineConfig.style || {} }, true),
      )
    }
  }
}
