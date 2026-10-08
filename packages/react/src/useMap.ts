import type { Map as MapInstance } from 'ts-maps'
import { useContext } from 'react'
import { MapContext } from './MapContext'

/**
 * Returns the current map from context.
 *
 * Throws if used outside of a `<Map>` provider — this keeps runtime failures
 * close to the mistake rather than surfacing as a confusing null later on.
 */
export function useMap(): MapInstance {
  const ctx = useContext(MapContext)
  if (!ctx.map)
    throw new Error('useMap must be used within a <Map> component')
  return ctx.map
}

/**
 * Like `useMap` but returns `null` when no map is available. Useful for
 * components that gracefully degrade without a map.
 */
export function useMapOptional(): MapInstance | null {
  return useContext(MapContext).map
}
