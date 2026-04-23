// Internal types for the expression evaluator. These are kept separate from
// the public style-spec types to keep the surface area small — callers should
// import from `./index` rather than reaching in here directly.

// The set of runtime types an expression can return. `value` is the catch-all
// used when a position accepts anything; the evaluator will still validate
// against the expected type of the enclosing property.
export type ExpressionType
  = | 'string'
    | 'number'
    | 'boolean'
    | 'color'
    | 'array'
    | 'null'
    | 'formatted'
    | 'resolvedImage'
    | 'value'

// A parsed RGBA color in [0..1] space. Stored as a plain tuple to keep the
// evaluator allocation-lean in hot loops — no wrapper objects.
export type RGBA = [number, number, number, number]

// Everything the evaluator needs to resolve an expression against a feature
// at a given zoom level. `feature` and `featureState` are optional because
// zoom-only expressions don't need them; we use that fact downstream to
// decide whether a compiled expression can be cached across features.
export interface EvaluationContext {
  zoom: number
  feature?: {
    // MVT geometry type: 1 = Point, 2 = LineString, 3 = Polygon.
    type: 1 | 2 | 3
    id?: number | string
    properties: Record<string, unknown>
  }
  featureState?: Record<string, unknown>
  // Progress along a line [0, 1]. Set by the line-gradient sampler when
  // evaluating `['line-progress']` stops; undefined elsewhere.
  lineProgress?: number
  globalProperties?: {
    bearing?: number
    pitch?: number
    zoom: number
  }
}

// A compiled expression: a closure plus metadata the renderer uses to decide
// whether it needs to re-evaluate on zoom change, on feature change, or on
// feature-state change. Every flag starts false and ORs upward as children
// propagate their dependencies.
export interface CompiledExpression {
  evaluate: (ctx: EvaluationContext) => unknown
  returnType: ExpressionType
  dependsOnZoom: boolean
  dependsOnFeature: boolean
  dependsOnFeatureState: boolean
}
