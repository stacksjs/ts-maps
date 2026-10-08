import type { Map as MapInstance } from 'ts-maps'
import type { MapContextValue } from './context'
import { getContext } from 'svelte'
import { MAP_CONTEXT_KEY } from './context'

/**
 * The `Map` of the surrounding `<Map>`, or `null` outside one.
 *
 * Call it during component initialisation — in the script, not in `onMount`
 * or `onDestroy`. It reads Svelte's context, which is only there while the
 * component is being set up. Children of `<Map>` are created once the map
 * exists, so it is never `null` inside a `<Map>`.
 */
export function useMap(): MapInstance | null {
  const ctx = getContext<MapContextValue | undefined>(MAP_CONTEXT_KEY)
  return ctx?.getMap() ?? null
}

/**
 * The same as `useMap`: the map, or `null` outside a `<Map>`. Named for
 * parity with the React and Vue bindings, where `useMap` throws and this one
 * does not.
 */
export function useMapOptional(): MapInstance | null {
  return useMap()
}
