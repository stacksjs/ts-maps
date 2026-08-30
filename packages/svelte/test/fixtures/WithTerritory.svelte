<script lang="ts">
  // Slot content has to be authored in a component, so the territory layers
  // are exercised through this rather than from a test file.
  import type { TerritoryStore } from 'ts-maps'
  import Map from '../../src/Map.svelte'
  import RunTrailLayer from '../../src/RunTrailLayer.svelte'
  import TerritoryLayer from '../../src/TerritoryLayer.svelte'

  export let store: TerritoryStore | undefined = undefined
  export let track: number[][] | undefined = undefined
</script>

<Map center={[34.02, -118.47]} zoom={15}>
  {#if store}
    <TerritoryLayer {store} self="sam" />
  {/if}
  {#if track}
    <RunTrailLayer {track} />
  {/if}
</Map>
