<script lang="ts">
  // A <Map> with children, which a test cannot express on its own: slot
  // content has to be authored in a component.
  import Map from '../../src/Map.svelte'
  import Marker from '../../src/Marker.svelte'
  import ZoomControl from '../../src/ZoomControl.svelte'
  import Probe from './Probe.svelte'

  export let onmap: (map: unknown) => void
  export let withMarker = false
  export let withControl = false
</script>

<Map center={[0, 0]} zoom={3}>
  <Probe {onmap} />
  {#if withMarker}
    <Marker position={[34.02, -118.47]} title="Pier" />
  {/if}
  {#if withControl}
    <ZoomControl position="bottomright" />
  {/if}
</Map>
