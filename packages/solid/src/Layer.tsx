import type { JSX } from 'solid-js'
import { onCleanup, onMount } from 'solid-js'
import { useMap } from './context'

export interface LayerProps {
  /** The layer spec, such as `{ id, type: 'circle', source }`. Wins over the props below. */
  layer?: { id: string, type: string, [key: string]: unknown }
  /** Put the layer below the layer with this id. */
  before?: string
  id?: string
  type?: 'fill' | 'line' | 'circle' | 'symbol' | 'raster' | 'background' | 'fill-extrusion' | 'heatmap' | 'hillshade'
  source?: string
  sourceLayer?: string
  paint?: Record<string, unknown>
  layout?: Record<string, unknown>
  filter?: unknown
}

interface StyleApi {
  // eslint-disable-next-line no-unused-vars
  addStyleLayer: (spec: Record<string, unknown>, before?: string) => void
  // eslint-disable-next-line no-unused-vars
  removeStyleLayer: (id: string) => void
}

/**
 * A style-spec layer. Give the whole spec as `layer`, as the React and Vue
 * bindings take it, or its fields as props. Read once; removed on cleanup.
 */
export function Layer(props: LayerProps): JSX.Element {
  // Read in the body: the context is not there in onCleanup.
  const map = useMap() as unknown as StyleApi | null
  let added: string | null = null

  onMount(() => {
    if (!map)
      return
    let spec: Record<string, unknown> | undefined = props.layer
    if (!spec) {
      spec = { id: props.id, type: props.type }
      if (props.source) spec.source = props.source
      if (props.sourceLayer) spec['source-layer'] = props.sourceLayer
      if (props.paint) spec.paint = props.paint
      if (props.layout) spec.layout = props.layout
      if (props.filter !== undefined) spec.filter = props.filter
    }
    map.addStyleLayer(spec, props.before)
    added = spec.id as string
  })

  onCleanup(() => {
    if (map && added !== null)
      map.removeStyleLayer(added)
    added = null
  })

  return null
}
