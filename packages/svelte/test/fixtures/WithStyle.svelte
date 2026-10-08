<script lang="ts">
  // `style` and `class` written as attributes, the way the guide writes them,
  // rather than spread from an object.
  import Map from '../../src/Map.svelte'
  import Probe from './Probe.svelte'

  export let onmap: (map: unknown) => void
  export let basemap: object
</script>

<Map center={[0, 0]} zoom={3} style={basemap} class="written-out">
  <Probe {onmap} />
</Map>
