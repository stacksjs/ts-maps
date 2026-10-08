import type { JSX } from 'solid-js'
import { onCleanup, onMount } from 'solid-js'
import { useMap } from './context'

export interface SourceProps {
  id: string
  /** The source spec, such as `{ type: 'geojson', data }`. Wins over the props below. */
  source?: Record<string, unknown>
  type?: 'vector' | 'raster' | 'raster-dem' | 'geojson'
  /** A TileJSON URL, in place of `tiles`. */
  url?: string
  tiles?: string[]
  tileSize?: number
  data?: unknown
}

interface StyleApi {
  // eslint-disable-next-line no-unused-vars
  addSource: (id: string, source: Record<string, unknown>) => void
  // eslint-disable-next-line no-unused-vars
  removeSource: (id: string) => void
}

/**
 * A style-spec source. Give the whole spec as `source`, as the React and Vue
 * bindings take it, or its fields as props. Read once; removed on cleanup.
 */
export function Source(props: SourceProps): JSX.Element {
  // Read in the body: the context is not there in onCleanup.
  const map = useMap() as unknown as StyleApi | null
  let added: string | null = null

  onMount(() => {
    if (!map)
      return
    let spec = props.source
    if (!spec) {
      spec = { type: props.type }
      if (props.url !== undefined) spec.url = props.url
      if (props.tiles) spec.tiles = props.tiles
      if (props.tileSize !== undefined) spec.tileSize = props.tileSize
      if (props.data !== undefined) spec.data = props.data
    }
    map.addSource(props.id, spec)
    added = props.id
  })

  onCleanup(() => {
    if (map && added !== null)
      map.removeSource(added)
    added = null
  })

  return null
}
