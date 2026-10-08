import type { Map as MapInstance } from 'ts-maps'
import { createContext } from 'react'

export interface MapContextValue {
  map: MapInstance | null
}

export const MapContext: React.Context<MapContextValue> = createContext<MapContextValue>({ map: null })
