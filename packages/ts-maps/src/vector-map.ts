import type { MapOptions } from './types'
import Map from './map'

export class VectorMap {
  constructor(options: MapOptions = {} as MapOptions) {
    if (!options.selector) {
      throw new Error('Selector is not given.')
    }

    return new Map(options)
  }

  // Public
  static addMap(name: string, map: any): void {
    Map.maps[name] = map
  }
}
