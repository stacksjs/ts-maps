import type { JSX } from 'solid-js'
import { onCleanup, onMount } from 'solid-js'
import { useMap } from './context'

export interface SourceProps {
  id: string
  type: 'vector' | 'raster' | 'raster-dem' | 'geojson'
  tiles?: string[]
  tileSize?: number
  data?: unknown
}

export function Source(props: SourceProps): JSX.Element {
  onMount(() => {
    const map = useMap() as unknown as {
      addSource?: (id: string, source: Record<string, unknown>) => void
    } | null
    if (!map?.addSource)
      return
    const source: Record<string, unknown> = { type: props.type }
    if (props.tiles) source.tiles = props.tiles
    if (props.tileSize !== undefined) source.tileSize = props.tileSize
    if (props.data !== undefined) source.data = props.data
    map.addSource(props.id, source)
  })

  onCleanup(() => {
    const map = useMap() as unknown as { removeSource?: (id: string) => void } | null
    map?.removeSource?.(props.id)
  })

  return null
}
