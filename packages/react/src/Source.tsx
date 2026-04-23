import { useEffect } from 'react'
import { useMap } from './useMap'

export interface SourceProps {
  id: string
  /**
   * Style-spec source object — e.g. `{ type: 'vector', tiles: [...] }`.
   * See the ts-maps core-map style-spec types for the full schema.
   */
  source: unknown
}

/**
 * Registers a style-spec source with the map. Removes it on unmount.
 */
export function Source({ id, source }: SourceProps): null {
  const map = useMap()
  useEffect(() => {
    ;(map as unknown as { addSource: (id: string, s: unknown) => void }).addSource(id, source)
    return () => {
      ;(map as unknown as { removeSource: (id: string) => void }).removeSource(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id])
  return null
}
