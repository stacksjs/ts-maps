import type { ScaleOptions } from '../types'

interface Tick {
  value: string
  label: string
}

class OrdinalScale {
  private _scale: Record<string, string>

  constructor(options: ScaleOptions) {
    this._scale = options.scale
  }

  getValue(value: string | number): string {
    return this._scale[String(value)]
  }

  getTicks(): Tick[] {
    const ticks: Tick[] = []

    for (const key in this._scale) {
      ticks.push({
        value: this._scale[key],
        label: key,
      })
    }

    return ticks
  }
}

export default OrdinalScale
