import type { Map as MapInstance } from 'ts-maps'
import type { Accessor } from 'solid-js'
import { createContext, useContext } from 'solid-js'

export const MapContext: ReturnType<typeof createContext<Accessor<MapInstance | null> | null>> = createContext<Accessor<MapInstance | null> | null>(null)

/**
 * The `Map` of the surrounding `<Map>`, or `null` outside one.
 *
 * Read it in the component's body, or in an effect. Solid's context is not
 * there in an `onCleanup`: keep the map from the body for teardown.
 */
export function useMap(): MapInstance | null {
  const ctx = useContext(MapContext)
  return ctx ? ctx() : null
}

/**
 * The same as `useMap`: the map, or `null` outside a `<Map>`. Named for
 * parity with the React and Vue bindings, where `useMap` throws and this one
 * does not.
 */
export function useMapOptional(): MapInstance | null {
  return useMap()
}
