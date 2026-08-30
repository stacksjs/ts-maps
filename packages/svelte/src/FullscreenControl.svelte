<script lang="ts">
  // Named for parity with the React, Vue and Solid bindings; the lifecycle
  // lives in MapControl.svelte.
  import MapControl from './MapControl.svelte'

  export let position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright' | undefined = undefined
  export let options: Record<string, unknown> | undefined = undefined
</script>

<MapControl type="fullscreen" {position} {options} />
