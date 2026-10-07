import type { JSX } from 'solid-js'
import type { TreesOptions } from 'ts-maps'
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js'
import { Trees as TsTrees } from 'ts-maps'
import { useMap } from './context'

/* eslint-disable no-unused-vars */
export interface TreesProps extends TreesOptions {
  /** The underlying trees, for `setOptions`. */
  onReady?: (trees: TsTrees) => void
}
/* eslint-enable no-unused-vars */

/**
 * Trees, standing in the woods and parks the basemap already has, after
 * Apple Maps: low-poly trees that come in as the map tilts. One per map.
 *
 * ```tsx
 * <Map center={[37.7694, -122.4862]} zoom={16} pitch={60}>
 *   <Trees spacing={12} />
 * </Map>
 * ```
 *
 * Every prop is followed as it changes.
 */
export function Trees(props: TreesProps): JSX.Element {
  const [trees, setTrees] = createSignal<TsTrees | null>(null)
  const options = (): TreesOptions => ({
    spacing: props.spacing,
    maxPerTile: props.maxPerTile,
    minZoom: props.minZoom,
    minPitch: props.minPitch,
    colors: props.colors,
    height: props.height,
    match: props.match,
  })
  let applied: { key: string, match: TreesOptions['match'] } | null = null
  const keyOf = (o: TreesOptions): string => JSON.stringify([o.spacing, o.maxPerTile, o.minZoom, o.minPitch, o.colors, o.height])

  // An effect rather than onMount: the map arrives through a signal.
  createEffect(() => {
    const map = useMap()
    if (!map)
      return
    const made = untrack(() => {
      const o = options()
      applied = { key: keyOf(o), match: o.match }
      return new TsTrees(o)
    })
    made.addTo(map)
    untrack(() => props.onReady?.(made))
    setTrees(made)
    onCleanup(() => {
      made.remove()
      setTrees(null)
    })
  })

  // Arrays are compared by content, so a new `colors` with the same colours
  // does not plant the trees again.
  createEffect(() => {
    const o = options()
    const key = keyOf(o)
    const current = trees()
    if (!current || (applied?.key === key && applied.match === o.match))
      return
    applied = { key, match: o.match }
    current.setOptions(o)
  })

  return null as unknown as JSX.Element
}
