// Shallow style-document diff. Produces a minimal command stream so that
// `map.setStyle(next, { diff: true })` can apply incremental updates instead
// of tearing down and rebuilding the whole document.
//
// The diff is *structural* — we compare the shape of layers and sources
// without interpreting expressions. If the two documents differ in a way
// we can't express with the fine-grained commands (e.g. a layer's `type`
// changed, or the layer order is rearranged in a way we can't reconstruct
// by `addLayer/removeLayer` alone), we fall back to a single `setStyle`
// command — the safe, correct default.

import type {
  LayerSpecification,
  LightSpecification,
  SourceSpecification,
  Style,
  TransitionSpecification,
} from './types'

export type StyleDiffCommand =
  | { command: 'setStyle', args: [Style] }
  | { command: 'addLayer', args: [LayerSpecification, string | undefined] }
  | { command: 'removeLayer', args: [string] }
  | { command: 'setLayoutProperty', args: [string, string, unknown] }
  | { command: 'setPaintProperty', args: [string, string, unknown] }
  | { command: 'setLayerZoomRange', args: [string, number | undefined, number | undefined] }
  | { command: 'setFilter', args: [string, unknown] }
  | { command: 'addSource', args: [string, SourceSpecification] }
  | { command: 'removeSource', args: [string] }
  | { command: 'setSourceData', args: [string, unknown] }
  | { command: 'setTransition', args: [TransitionSpecification] }
  | { command: 'setLight', args: [LightSpecification] }

export interface StyleDiff {
  commands: StyleDiffCommand[]
}

// Structural deep-equal — good enough for diffing JSON style docs. No cycle
// detection (styles never cycle) and no prototype handling (styles are plain
// data).
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b)
    return true
  if (typeof a !== typeof b)
    return false
  if (a === null || b === null)
    return a === b

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length)
      return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i]))
        return false
    }
    return true
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>
    const bo = b as Record<string, unknown>
    const keysA = Object.keys(ao)
    const keysB = Object.keys(bo)
    if (keysA.length !== keysB.length)
      return false
    for (const k of keysA) {
      if (!Object.prototype.hasOwnProperty.call(bo, k))
        return false
      if (!deepEqual(ao[k], bo[k]))
        return false
    }
    return true
  }

  return false
}

// Build a command that captures every possible change in one shot. Used as
// the fallback when fine-grained diffing isn't feasible.
function fullReset(next: Style): StyleDiff {
  return { commands: [{ command: 'setStyle', args: [next] }] }
}

// Index an array of layers by id. A duplicate-id style is malformed; we
// arbitrarily take the last occurrence, which lines up with how downstream
// renderers typically behave.
function indexLayers(layers: LayerSpecification[]): Record<string, LayerSpecification> {
  const out: Record<string, LayerSpecification> = {}
  for (const layer of layers)
    out[layer.id] = layer
  return out
}

// Compute the paint-property level diff for a single layer. Assumes both
// layers have the same type (the caller ensures this).
function diffPaint(
  prev: LayerSpecification,
  next: LayerSpecification,
  commands: StyleDiffCommand[],
): void {
  const prevPaint = (prev as { paint?: Record<string, unknown> }).paint || {}
  const nextPaint = (next as { paint?: Record<string, unknown> }).paint || {}

  for (const key of Object.keys(nextPaint)) {
    if (!deepEqual(prevPaint[key], nextPaint[key]))
      commands.push({ command: 'setPaintProperty', args: [next.id, key, nextPaint[key]] })
  }
  for (const key of Object.keys(prevPaint)) {
    if (!(key in nextPaint))
      commands.push({ command: 'setPaintProperty', args: [next.id, key, undefined] })
  }
}

function diffLayout(
  prev: LayerSpecification,
  next: LayerSpecification,
  commands: StyleDiffCommand[],
): void {
  const prevLayout = (prev as { layout?: Record<string, unknown> }).layout || {}
  const nextLayout = (next as { layout?: Record<string, unknown> }).layout || {}

  for (const key of Object.keys(nextLayout)) {
    if (!deepEqual(prevLayout[key], nextLayout[key]))
      commands.push({ command: 'setLayoutProperty', args: [next.id, key, nextLayout[key]] })
  }
  for (const key of Object.keys(prevLayout)) {
    if (!(key in nextLayout))
      commands.push({ command: 'setLayoutProperty', args: [next.id, key, undefined] })
  }
}

export function diffStyles(prev: Style, next: Style): StyleDiff {
  // Version or sprite/glyphs changes require a full reload — these
  // parameters thread through the whole renderer.
  if (prev.version !== next.version)
    return fullReset(next)
  if (!deepEqual(prev.sprite, next.sprite))
    return fullReset(next)
  if (prev.glyphs !== next.glyphs)
    return fullReset(next)

  const commands: StyleDiffCommand[] = []

  // ---------- transition & light ----------
  if (!deepEqual(prev.transition, next.transition) && next.transition !== undefined)
    commands.push({ command: 'setTransition', args: [next.transition] })
  if (!deepEqual(prev.light, next.light) && next.light !== undefined)
    commands.push({ command: 'setLight', args: [next.light] })

  // ---------- sources ----------
  const prevSources = prev.sources || {}
  const nextSources = next.sources || {}

  for (const id of Object.keys(prevSources)) {
    if (!(id in nextSources)) {
      commands.push({ command: 'removeSource', args: [id] })
    }
  }
  for (const id of Object.keys(nextSources)) {
    const p = prevSources[id]
    const n = nextSources[id]
    if (p === undefined) {
      commands.push({ command: 'addSource', args: [id, n] })
      continue
    }
    if (deepEqual(p, n))
      continue

    // Special-case GeoJSON data swap — the common hot path.
    if (p.type === 'geojson' && n.type === 'geojson') {
      const pNoData = { ...p, data: undefined }
      const nNoData = { ...n, data: undefined }
      if (deepEqual(pNoData, nNoData)) {
        commands.push({ command: 'setSourceData', args: [id, n.data] })
        continue
      }
    }

    // Otherwise we have to remove + re-add. We intentionally don't try to
    // mutate source type in place — too many invariants to keep track of.
    commands.push({ command: 'removeSource', args: [id] })
    commands.push({ command: 'addSource', args: [id, n] })
  }

  // ---------- layers ----------
  const prevLayers = prev.layers || []
  const nextLayers = next.layers || []
  const prevById = indexLayers(prevLayers)
  const nextById = indexLayers(nextLayers)

  // Removals.
  for (const layer of prevLayers) {
    if (!(layer.id in nextById))
      commands.push({ command: 'removeLayer', args: [layer.id] })
  }

  // Detect reordering: if the relative order of layers that appear in *both*
  // documents differs, we can't express it with the command set we have, so
  // we bail to a full setStyle.
  const prevOrder = prevLayers.filter(l => l.id in nextById).map(l => l.id)
  const nextOrder = nextLayers.filter(l => l.id in prevById).map(l => l.id)
  if (prevOrder.length !== nextOrder.length)
    return fullReset(next)
  for (let i = 0; i < prevOrder.length; i++) {
    if (prevOrder[i] !== nextOrder[i])
      return fullReset(next)
  }

  // Additions + per-layer property diffs, walking `nextLayers` so the
  // `before` anchor for each addLayer command is correct.
  for (let i = 0; i < nextLayers.length; i++) {
    const n = nextLayers[i]
    const p = prevById[n.id]

    if (p === undefined) {
      // The anchor is the id of the *next* layer in nextLayers that already
      // exists in prev. undefined means append.
      let before: string | undefined
      for (let j = i + 1; j < nextLayers.length; j++) {
        if (nextLayers[j].id in prevById) {
          before = nextLayers[j].id
          break
        }
      }
      commands.push({ command: 'addLayer', args: [n, before] })
      continue
    }

    // Layer `type` or `source` change → we can't reconfigure in place.
    if (p.type !== n.type) {
      commands.push({ command: 'removeLayer', args: [n.id] })
      // Find anchor.
      let before: string | undefined
      for (let j = i + 1; j < nextLayers.length; j++) {
        if (nextLayers[j].id in prevById && nextLayers[j].id !== n.id) {
          before = nextLayers[j].id
          break
        }
      }
      commands.push({ command: 'addLayer', args: [n, before] })
      continue
    }

    const pSource = (p as { source?: string }).source
    const nSource = (n as { source?: string }).source
    const pSourceLayer = (p as { 'source-layer'?: string })['source-layer']
    const nSourceLayer = (n as { 'source-layer'?: string })['source-layer']
    if (pSource !== nSource || pSourceLayer !== nSourceLayer) {
      commands.push({ command: 'removeLayer', args: [n.id] })
      let before: string | undefined
      for (let j = i + 1; j < nextLayers.length; j++) {
        if (nextLayers[j].id in prevById && nextLayers[j].id !== n.id) {
          before = nextLayers[j].id
          break
        }
      }
      commands.push({ command: 'addLayer', args: [n, before] })
      continue
    }

    // Zoom range.
    if (p.minzoom !== n.minzoom || p.maxzoom !== n.maxzoom)
      commands.push({ command: 'setLayerZoomRange', args: [n.id, n.minzoom, n.maxzoom] })

    // Filter (only present on non-background layers).
    const pFilter = (p as { filter?: unknown }).filter
    const nFilter = (n as { filter?: unknown }).filter
    if (!deepEqual(pFilter, nFilter))
      commands.push({ command: 'setFilter', args: [n.id, nFilter] })

    diffPaint(p, n, commands)
    diffLayout(p, n, commands)
  }

  return { commands }
}
