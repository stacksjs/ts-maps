import type { TsMap } from 'ts-maps'
import type { Accessor } from 'solid-js'
import { createContext, useContext } from 'solid-js'

export const MapContext: ReturnType<typeof createContext<Accessor<TsMap | null> | null>> = createContext<Accessor<TsMap | null> | null>(null)

export function useMap(): TsMap | null {
  const ctx = useContext(MapContext)
  return ctx ? ctx() : null
}
