import type { TreesOptions } from 'ts-maps'
import { useEffect, useRef } from 'react'
import { Trees as TsTrees } from 'ts-maps'
import { useMap } from './useMap'

export interface TreesProps extends TreesOptions {
  /** The underlying trees, for `setOptions`. */
  // eslint-disable-next-line no-unused-vars
  onReady?: (trees: TsTrees) => void
}

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
export function Trees(props: TreesProps): null {
  const map = useMap()
  const treesRef = useRef<TsTrees | null>(null)
  const latest = useRef(props)
  latest.current = props

  const { spacing, maxPerTile, minZoom, minPitch, colors, height, match } = props
  const options: TreesOptions = { spacing, maxPerTile, minZoom, minPitch, colors, height, match }
  // Arrays are compared by content, so a new `colors` each render does not
  // plant the trees again.
  const key = JSON.stringify([spacing, maxPerTile, minZoom, minPitch, colors, height])
  const applied = useRef<{ key: string, match: TreesOptions['match'] } | null>(null)

  useEffect(() => {
    const trees = new TsTrees(options)
    trees.addTo(map)
    treesRef.current = trees
    applied.current = { key, match }
    latest.current.onReady?.(trees)
    return () => {
      trees.remove()
      treesRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useEffect(() => {
    if (!treesRef.current || (applied.current?.key === key && applied.current.match === match))
      return
    applied.current = { key, match }
    treesRef.current.setOptions(options)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, match])

  return null
}
