import { useEffect } from 'react'
import { useMapOptional } from './useMap'

// eslint-disable-next-line no-unused-vars
export type MapEventHandler = (e: any) => void

/**
 * Subscribe to a `TsMap` event for the lifetime of the calling component.
 * The handler is re-bound when `event` or `handler` identity changes.
 */
export function useMapEvent(event: string, handler: MapEventHandler): void {
  const map = useMapOptional()
  useEffect(() => {
    if (!map)
      return
    map.on(event, handler)
    return () => {
      map.off(event, handler)
    }
  }, [map, event, handler])
}
