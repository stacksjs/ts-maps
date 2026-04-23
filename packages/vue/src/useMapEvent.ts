import { onBeforeUnmount, watch } from 'vue'
import { useMapOptional } from './useMap'

// eslint-disable-next-line no-unused-vars
export type MapEventHandler = (e: any) => void

/**
 * Subscribe to a `TsMap` event for the lifetime of the calling component.
 * Re-binds automatically if the map instance changes.
 */
export function useMapEvent(event: string, handler: MapEventHandler): void {
  const mapRef = useMapOptional()
  if (!mapRef)
    return

  let bound: { off: () => void } | null = null
  const stop = watch(
    mapRef,
    (map) => {
      bound?.off()
      bound = null
      if (!map)
        return
      map.on(event, handler)
      bound = { off: () => map.off(event, handler) }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    stop()
    bound?.off()
    bound = null
  })
}
