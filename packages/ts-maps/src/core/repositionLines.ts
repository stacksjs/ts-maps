export default function repositionLines() {
  const curvature = this.params.lines.curvature || 0.5

  Object.values(this._lines).forEach((line) => {
    const startMarker = Object.values(this._markers).find(
      ({ config }) => config.name === line.getConfig().from,
    )

    const endMarker = Object.values(this._markers).find(
      ({ config }) => config.name === line.getConfig().to,
    )

    if (startMarker && endMarker) {
      const { x: x1, y: y1 } = this.getMarkerPosition(startMarker.config)
      const { x: x2, y: y2 } = this.getMarkerPosition(endMarker.config)

      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2
      const curveX = midX + curvature * (y2 - y1)
      const curveY = midY - curvature * (x2 - x1)

      line.setStyle({
        d: `M${x1},${y1} Q${curveX},${curveY} ${x2},${y2}`,
      })
    }
  })
}
