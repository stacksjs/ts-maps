// Runtime validator for the Style Specification.
//
// Philosophy: collect all errors rather than short-circuiting. Consumers —
// style authors, the playground, the `setStyle` diff engine — need the full
// picture so they can fix everything in one pass. Expression arrays in a
// paint/layout slot are handed to `validateExpression` from the expressions
// subsystem so style-level errors come out in the same stream as shape
// mismatches.

import type { LayerType, SourceSpecification } from './types'
import type { ExpressionType } from './expressions'
import type { PropertySchema, PropertySchemaType } from './schema'
import { isExpression, validateExpression } from './expressions'
import { layerTypes, layoutPropertySchemas, paintPropertySchemas, sourceTypes } from './schema'

export interface ValidationError {
  message: string
  line?: number
  path?: string[]
}

// Helper: push a well-formed error into the accumulator. Keeping this tiny
// keeps the call sites focused on what the error *is* rather than on how
// it's recorded.
function pushError(errors: ValidationError[], message: string, path: string[]): void {
  errors.push({ message, path: path.slice() })
}

// Is this value a plain object (as opposed to an array, null, or a scalar)?
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ---------- value-shape checks ----------

// Map a property-schema type to the expression type we ask the expression
// validator to enforce. The two taxonomies line up almost 1:1 — the only
// mismatch is `padding` / `enum`, both of which the expression validator
// tolerates as generic `value`.
function expressionTypeFor(t: PropertySchemaType): ExpressionType {
  switch (t) {
    case 'color': return 'color'
    case 'number': return 'number'
    case 'string': return 'string'
    case 'boolean': return 'boolean'
    case 'array': return 'array'
    case 'enum': return 'string'
    case 'padding': return 'value'
    case 'formatted': return 'formatted'
    case 'resolvedImage': return 'resolvedImage'
  }
}

// Does `value` match a PropertySchema's declared literal shape? Returns
// either true/false for a literal or an array of expression error messages
// for arrays that need to be interpreted as expressions.
function matchesSchema(value: unknown, schema: PropertySchema): true | false | string[] {
  // Arrays are either expressions or literal data (for `array` / `padding`
  // schema types). Disambiguate by looking at the head token.
  if (Array.isArray(value)) {
    if (isExpression(value)) {
      const errs = validateExpression(value, expressionTypeFor(schema.type))
      return errs.length === 0 ? true : errs
    }
    if (schema.type === 'array') {
      if (schema.length !== undefined && value.length !== schema.length)
        return false
      return true
    }
    if (schema.type === 'padding') {
      return value.length === 2 || value.length === 4
    }
    // Mystery array — unknown operator head. Treat as invalid.
    return false
  }

  switch (schema.type) {
    case 'color':
      return typeof value === 'string'
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value))
        return false
      if (schema.minimum !== undefined && value < schema.minimum)
        return false
      if (schema.maximum !== undefined && value > schema.maximum)
        return false
      return true
    case 'string':
      return typeof value === 'string'
    case 'boolean':
      return typeof value === 'boolean'
    case 'enum':
      return typeof value === 'string' && (schema.values ? schema.values.includes(value) : true)
    case 'padding':
      return typeof value === 'number'
    case 'formatted':
      return typeof value === 'string'
    case 'resolvedImage':
      return typeof value === 'string'
    case 'array':
      return false
  }
}

// ---------- property validation ----------

function validateProperty(
  schemas: Record<string, PropertySchema> | undefined,
  layerType: LayerType,
  kind: 'paint' | 'layout',
  name: string,
  value: unknown,
  path: string[],
): ValidationError[] {
  const errors: ValidationError[] = []
  const schema = schemas ? schemas[name] : undefined

  if (!schema) {
    pushError(errors, `Unknown ${kind} property "${name}" for layer type "${layerType}"`, path)
    return errors
  }

  const result = matchesSchema(value, schema)
  if (result === true) return errors
  if (result === false) {
    pushError(
      errors,
      `Invalid value for ${kind} property "${name}" (expected ${describeSchema(schema)})`,
      path,
    )
    return errors
  }
  // Expression validation produced structured errors — surface each one on
  // the property's path so the caller sees the full detail.
  for (const message of result)
    pushError(errors, `Invalid expression for ${kind} property "${name}": ${message}`, path)
  return errors
}

function describeSchema(schema: PropertySchema): string {
  if (schema.type === 'enum' && schema.values)
    return `one of ${schema.values.map(v => `"${v}"`).join(', ')}`
  if (schema.type === 'array' && schema.length !== undefined)
    return `array of length ${schema.length}`
  return schema.type
}

export function validatePaintProperty(layerType: LayerType, name: string, value: unknown): ValidationError[] {
  const schemas = paintPropertySchemas[layerType]
  return validateProperty(schemas, layerType, 'paint', name, value, ['paint', name])
}

export function validateLayoutProperty(layerType: LayerType, name: string, value: unknown): ValidationError[] {
  const schemas = layoutPropertySchemas[layerType]
  return validateProperty(schemas, layerType, 'layout', name, value, ['layout', name])
}

// ---------- source validation ----------

export function validateSource(source: unknown, id?: string): ValidationError[] {
  const errors: ValidationError[] = []
  const path: string[] = id !== undefined ? ['sources', id] : ['source']

  if (!isPlainObject(source)) {
    pushError(errors, 'Source must be an object', path)
    return errors
  }

  const type = source.type
  if (typeof type !== 'string') {
    pushError(errors, 'Source is missing required "type" property', path.concat('type'))
    return errors
  }

  if (!sourceTypes.includes(type)) {
    pushError(errors, `Unknown source type "${type}"`, path.concat('type'))
    return errors
  }

  // Tile-based sources need either `url` or `tiles`.
  if (type === 'vector' || type === 'raster' || type === 'raster-dem') {
    const hasUrl = typeof source.url === 'string'
    const hasTiles = Array.isArray(source.tiles) && source.tiles.length > 0
    if (!hasUrl && !hasTiles) {
      pushError(
        errors,
        `Source of type "${type}" must define either "url" or a non-empty "tiles" array`,
        path,
      )
    }
    if (source.tiles !== undefined && !Array.isArray(source.tiles))
      pushError(errors, '"tiles" must be an array of URL templates', path.concat('tiles'))
    if (source.url !== undefined && typeof source.url !== 'string')
      pushError(errors, '"url" must be a string', path.concat('url'))
    if (source.minzoom !== undefined && typeof source.minzoom !== 'number')
      pushError(errors, '"minzoom" must be a number', path.concat('minzoom'))
    if (source.maxzoom !== undefined && typeof source.maxzoom !== 'number')
      pushError(errors, '"maxzoom" must be a number', path.concat('maxzoom'))
  }

  if (type === 'geojson') {
    if (source.data === undefined)
      pushError(errors, 'GeoJSON source is missing required "data" property', path.concat('data'))
  }

  return errors
}

// ---------- layer validation ----------

export function validateLayer(
  layer: unknown,
  sources?: Record<string, SourceSpecification>,
): ValidationError[] {
  const errors: ValidationError[] = []
  const path: string[] = ['layer']

  if (!isPlainObject(layer)) {
    pushError(errors, 'Layer must be an object', path)
    return errors
  }

  if (typeof layer.id !== 'string' || layer.id.length === 0)
    pushError(errors, 'Layer is missing required "id" property', path.concat('id'))

  const type = layer.type
  if (typeof type !== 'string') {
    pushError(errors, 'Layer is missing required "type" property', path.concat('type'))
    return errors
  }

  if (!layerTypes.includes(type as LayerType)) {
    pushError(errors, `Unknown layer type "${type}"`, path.concat('type'))
    return errors
  }

  const layerType = type as LayerType

  // `source` is required for every layer type except `background`.
  if (layerType !== 'background') {
    if (typeof layer.source !== 'string') {
      pushError(errors, `Layer of type "${layerType}" is missing required "source" property`, path.concat('source'))
    }
    else if (sources && !(layer.source in sources)) {
      pushError(errors, `Layer references undefined source "${layer.source}"`, path.concat('source'))
    }
  }

  if (layer.minzoom !== undefined && typeof layer.minzoom !== 'number')
    pushError(errors, '"minzoom" must be a number', path.concat('minzoom'))
  if (layer.maxzoom !== undefined && typeof layer.maxzoom !== 'number')
    pushError(errors, '"maxzoom" must be a number', path.concat('maxzoom'))

  const paint = layer.paint
  if (paint !== undefined) {
    if (!isPlainObject(paint)) {
      pushError(errors, 'Layer "paint" must be an object', path.concat('paint'))
    }
    else {
      const schemas = paintPropertySchemas[layerType]
      for (const name of Object.keys(paint)) {
        const subErrors = validateProperty(schemas, layerType, 'paint', name, paint[name], path.concat('paint', name))
        for (const e of subErrors)
          errors.push(e)
      }
    }
  }

  const layout = layer.layout
  if (layout !== undefined) {
    if (!isPlainObject(layout)) {
      pushError(errors, 'Layer "layout" must be an object', path.concat('layout'))
    }
    else {
      const schemas = layoutPropertySchemas[layerType]
      for (const name of Object.keys(layout)) {
        const subErrors = validateProperty(schemas, layerType, 'layout', name, layout[name], path.concat('layout', name))
        for (const e of subErrors)
          errors.push(e)
      }
    }
  }

  return errors
}

// ---------- root style validation ----------

export function validateStyle(style: unknown): ValidationError[] {
  const errors: ValidationError[] = []

  if (!isPlainObject(style)) {
    pushError(errors, 'Style must be an object', [])
    return errors
  }

  // version — must be exactly 8. This is a hard gate because the wire format
  // of earlier versions differs materially.
  if (style.version === undefined) {
    pushError(errors, 'Style is missing required "version" property', ['version'])
  }
  else if (style.version !== 8) {
    pushError(errors, `Unsupported style version: ${String(style.version)} (expected 8)`, ['version'])
  }

  // sources — required object map.
  const sources = style.sources
  if (sources === undefined) {
    pushError(errors, 'Style is missing required "sources" property', ['sources'])
  }
  else if (!isPlainObject(sources)) {
    pushError(errors, 'Style "sources" must be an object', ['sources'])
  }
  else {
    for (const id of Object.keys(sources)) {
      const sourceErrors = validateSource(sources[id], id)
      for (const e of sourceErrors)
        errors.push(e)
    }
  }

  // layers — required array.
  const layers = style.layers
  if (layers === undefined) {
    pushError(errors, 'Style is missing required "layers" property', ['layers'])
  }
  else if (!Array.isArray(layers)) {
    pushError(errors, 'Style "layers" must be an array', ['layers'])
  }
  else {
    const seenIds = new Set<string>()
    const sourceMap: Record<string, SourceSpecification> | undefined = isPlainObject(sources)
      ? (sources as Record<string, SourceSpecification>)
      : undefined

    for (let i = 0; i < layers.length; i++) {
      const layer: unknown = layers[i]
      const layerPath: string[] = ['layers', String(i)]

      if (!isPlainObject(layer)) {
        pushError(errors, 'Layer must be an object', layerPath)
        continue
      }

      // Duplicate id check. Empty/invalid ids are handled by validateLayer.
      if (typeof layer.id === 'string') {
        if (seenIds.has(layer.id))
          pushError(errors, `Duplicate layer id "${layer.id}"`, layerPath.concat('id'))
        else
          seenIds.add(layer.id)
      }

      const subErrors = validateLayer(layer, sourceMap)
      for (const e of subErrors) {
        // Rewrite the per-layer relative paths under the style-wide index.
        const relPath = e.path ? e.path.slice(1) : []
        errors.push({ message: e.message, path: layerPath.concat(relPath) })
      }
    }
  }

  // Optional top-level scalars — only shape-check when present.
  if (style.name !== undefined && typeof style.name !== 'string')
    pushError(errors, '"name" must be a string', ['name'])
  if (style.zoom !== undefined && typeof style.zoom !== 'number')
    pushError(errors, '"zoom" must be a number', ['zoom'])
  if (style.bearing !== undefined && typeof style.bearing !== 'number')
    pushError(errors, '"bearing" must be a number', ['bearing'])
  if (style.pitch !== undefined && typeof style.pitch !== 'number')
    pushError(errors, '"pitch" must be a number', ['pitch'])
  if (style.center !== undefined) {
    const c = style.center
    if (!Array.isArray(c) || c.length !== 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number')
      pushError(errors, '"center" must be a [lng, lat] tuple', ['center'])
  }
  if (style.glyphs !== undefined && typeof style.glyphs !== 'string')
    pushError(errors, '"glyphs" must be a string template', ['glyphs'])
  if (style.sprite !== undefined) {
    const s = style.sprite
    if (typeof s !== 'string' && !Array.isArray(s))
      pushError(errors, '"sprite" must be a string or an array of sprite sources', ['sprite'])
  }

  return errors
}
