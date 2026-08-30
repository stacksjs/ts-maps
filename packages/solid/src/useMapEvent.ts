import { createEffect, onCleanup } from 'solid-js'
import { useMap } from './context'

// eslint-disable-next-line no-unused-vars
export type MapEventHandler = (e: any) => void

/**
 * Subscribe to a map event for the lifetime of the calling component.
 *
 * Wrapped in an effect rather than `onMount`, because the map reaches children
 * through a signal: a component created in the same tick as the map would
 * otherwise read `null` and silently never subscribe.
 *
 * ```tsx
 * useMapEvent('moveend', () => console.log('settled'))
 * ```
 */
export function useMapEvent(event: string, handler: MapEventHandler): void {
  createEffect(() => {
    const map = useMap()
    if (!map)
      return

    map.on(event, handler)
    onCleanup(() => {
      map.off(event, handler)
    })
  })
}
