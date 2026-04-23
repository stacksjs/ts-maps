import type { LayerSpecification, Style as StyleSpec } from '../style-spec/types'
import { validateStyle } from '../style-spec/validate'

export interface StyleOptions {
  validate?: boolean
}

// In-memory representation of a live style document. Pure data + mutation
// helpers; hosting and rendering are the map's job to avoid a circular
// dependency between Map.ts and the concrete layer classes.
export class Style {
  declare spec: StyleSpec
  // Concrete hosted Layer instances, keyed by source id. The map writes to
  // this as it creates layers for each source.
  declare sourceLayers: Map<string, unknown>
  declare layerSpecs: Map<string, LayerSpecification>

  constructor(spec: StyleSpec, opts?: StyleOptions) {
    const shouldValidate = opts?.validate !== false
    if (shouldValidate) {
      const errors = validateStyle(spec)
      if (errors.length)
        throw new Error(`Invalid style: ${errors.map(e => e.message).join('; ')}`)
    }
    this.spec = this._cloneSpec(spec)
    // Ensure the required collections exist so downstream code can mutate
    // them without null-checks, even when validation was skipped on a
    // partially-specified style.
    if (!this.spec.sources) this.spec.sources = {}
    if (!Array.isArray(this.spec.layers)) this.spec.layers = []
    this.sourceLayers = new Map()
    this.layerSpecs = new Map()
    for (const layer of this.spec.layers) this.layerSpecs.set(layer.id, layer)
  }

  setPaintProperty(layerId: string, name: string, value: unknown): void {
    const spec = this.layerSpecs.get(layerId)
    if (!spec)
      throw new Error(`no layer with id ${layerId}`)
    const anySpec = spec as any
    anySpec.paint = { ...(anySpec.paint ?? {}), [name]: value }
  }

  setLayoutProperty(layerId: string, name: string, value: unknown): void {
    const spec = this.layerSpecs.get(layerId)
    if (!spec)
      throw new Error(`no layer with id ${layerId}`)
    const anySpec = spec as any
    anySpec.layout = { ...(anySpec.layout ?? {}), [name]: value }
  }

  setFilter(layerId: string, filter: unknown): void {
    const spec = this.layerSpecs.get(layerId)
    if (!spec)
      throw new Error(`no layer with id ${layerId}`)
    const anySpec = spec as any
    anySpec.filter = filter
  }

  setLayerZoomRange(layerId: string, minzoom?: number, maxzoom?: number): void {
    const spec = this.layerSpecs.get(layerId)
    if (!spec) throw new Error(`no layer with id ${layerId}`)
    if (minzoom !== undefined) (spec as any).minzoom = minzoom
    if (maxzoom !== undefined) (spec as any).maxzoom = maxzoom
  }

  serialize(): StyleSpec {
    return this._cloneSpec(this.spec)
  }

  // Translate a style-spec layer into the shape VectorTileMapLayer expects.
  // Exported via the instance so the map can call it without importing a
  // separate module. Pure function — no side effects.
  toVectorStyleLayer(layer: LayerSpecification): {
    id: string
    type: 'fill' | 'line' | 'circle' | 'symbol'
    sourceLayer: string
    minzoom?: number
    maxzoom?: number
    filter?: unknown
    paint: Record<string, unknown>
    layout: Record<string, unknown>
  } {
    const l = layer as any
    return {
      id: l.id,
      type: l.type,
      sourceLayer: l['source-layer'] ?? l.sourceLayer,
      minzoom: l.minzoom,
      maxzoom: l.maxzoom,
      filter: l.filter,
      paint: l.paint ?? {},
      layout: l.layout ?? {},
    }
  }

  _cloneSpec(spec: StyleSpec): StyleSpec {
    return JSON.parse(JSON.stringify(spec)) as StyleSpec
  }
}
