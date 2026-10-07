<script lang="ts">
  /**
   * Trees, standing in the woods and parks the basemap already has, after
   * Apple Maps: low-poly trees that come in as the map tilts. One per map.
   *
   * ```svelte
   * <Map center={[37.7694, -122.4862]} zoom={16} pitch={60}>
   *   <Trees spacing={12} />
   * </Map>
   * ```
   *
   * Every prop is followed as it changes.
   */
  import type { TreesOptions, TsMap } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { Trees } from 'ts-maps'
  import { useMap } from './useMap'

  /** Metres between trees in a wood. Default 9. */
  export let spacing: number | undefined = undefined
  /** Most trees a tile plants. Default 3000. */
  export let maxPerTile: number | undefined = undefined
  export let minZoom: number | undefined = undefined
  /** Degrees of tilt before trees appear. Default 20. */
  export let minPitch: number | undefined = undefined
  /** Crown colours, picked between per tree. */
  export let colors: string[] | undefined = undefined
  /** Metres. Default [7, 14]. */
  export let height: [number, number] | undefined = undefined
  /** Which features are woods to plant and which are single trees. */
  export let match: TreesOptions['match'] = undefined

  /* eslint-disable no-unused-vars */
  export let onReady: ((trees: Trees) => void) | undefined = undefined
  /* eslint-enable no-unused-vars */

  let map: TsMap | null = null
  let trees: Trees | null = null
  let applied: { key: string, match: TreesOptions['match'] } | null = null

  // Arrays are compared by content, so a new `colors` with the same colours
  // does not plant the trees again.
  function follow(options: TreesOptions): void {
    const key = JSON.stringify([options.spacing, options.maxPerTile, options.minZoom, options.minPitch, options.colors, options.height])
    if (!map || (applied?.key === key && applied.match === options.match))
      return
    applied = { key, match: options.match }
    if (trees) {
      trees.setOptions(options)
      return
    }
    trees = new Trees(options)
    trees.addTo(map)
    onReady?.(trees)
  }

  onMount(() => {
    map = useMap()
  })

  $: if (map) follow({ spacing, maxPerTile, minZoom, minPitch, colors, height, match })

  onDestroy(() => {
    trees?.remove()
    trees = null
  })
</script>
