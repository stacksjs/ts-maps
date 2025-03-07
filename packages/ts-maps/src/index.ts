import type { MapOptions } from './types'
import Map from './map'
import '../scss/vector-map.scss'

export class VectorMap {
  constructor(options: MapOptions = {} as MapOptions) {
    if (!options.selector) {
      throw new Error('Selector is not given.')
    }

    return new Map(options) as any
  }

  // Public
  static addMap(name: string, map: any): void {
    Map.maps[name] = map
  }
}

// Add to window object if in browser environment
declare global {
  interface Window {
    VectorMap: typeof VectorMap
  }
}

if (typeof window !== 'undefined') {
  window.VectorMap = VectorMap
}

export default VectorMap
