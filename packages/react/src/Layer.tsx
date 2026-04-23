import { useEffect } from 'react'
import { useMap } from './useMap'

export interface LayerProps {
  /** A style-spec layer object (must include `id` and `type`). */
  layer: { id: string, type: string, [key: string]: unknown }
  /** Insert this layer before the layer with this id, if present. */
  before?: string
}

/**
 * Adds a style-spec layer via `map.addStyleLayer`. This is distinct from the
 * legacy `addLayer(Layer)` API — it's the Mapbox-style declarative flavor.
 */
export function Layer({ layer, before }: LayerProps): null {
  const map = useMap()
  useEffect(() => {
    const api = map as unknown as {
      addStyleLayer: (l: unknown, before?: string) => void
      removeStyleLayer?: (id: string) => void
    }
    api.addStyleLayer(layer, before)
    return () => {
      api.removeStyleLayer?.(layer.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, layer.id])
  return null
}
