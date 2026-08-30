import { onDestroy } from 'svelte'
import { useMap } from './useMap'

// eslint-disable-next-line no-unused-vars
export type MapEventHandler = (e: any) => void

/**
 * Subscribe to a map event for the lifetime of the calling component.
 *
 * Call it during component initialisation, like any other Svelte lifecycle
 * function — it reads the map off the context and registers its own teardown.
 *
 * ```svelte
 * <script>
 *   import { useMapEvent } from '@ts-maps/svelte'
 *   useMapEvent('moveend', () => console.log('settled'))
 * </script>
 * ```
 */
export function useMapEvent(event: string, handler: MapEventHandler): void {
  const map = useMap()
  if (!map)
    return

  map.on(event, handler)
  onDestroy(() => {
    map.off(event, handler)
  })
}
