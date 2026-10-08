import type { TsMap } from 'ts-maps'
import type { Accessor } from 'solid-js'
import { createContext, useContext } from 'solid-js'

export const MapContext: ReturnType<typeof createContext<Accessor<TsMap | null> | null>> = createContext<Accessor<TsMap | null> | null>(null)

/**
 * The `TsMap` of the surrounding `<Map>`, or `null` outside one.
 *
 * Read it in the component's body, or in an effect. Solid's context is not
 * there in an `onCleanup`: keep the map from the body for teardown.
 */
export function useMap(): TsMap | null {
  const ctx = useContext(MapContext)
  return ctx ? ctx() : null
}

/**
 * The same as `useMap`: the map, or `null` outside a `<Map>`. Named for
 * parity with the React and Vue bindings, where `useMap` throws and this one
 * does not.
 */
export function useMapOptional(): TsMap | null {
  return useMap()
}
