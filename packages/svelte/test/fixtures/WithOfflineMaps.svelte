<script lang="ts">
  // Slot content has to be authored in a component, so the control is
  // exercised through this rather than from a test file.
  import Map from '../../src/Map.svelte'
  import OfflineMaps from '../../src/OfflineMaps.svelte'

  export let maps: any
  export let events: Array<[string, unknown]> = []
  export let open = false
  export let onlyOffline = false
  export let control: any = null

  export function setOpen(value: boolean): void {
    open = value
  }

  export function setOnlyOffline(value: boolean): void {
    onlyOffline = value
  }

  export function state(): { open: boolean, onlyOffline: boolean } {
    return { open, onlyOffline }
  }
</script>

<Map center={[37.78, -122.42]} zoom={15}>
  <OfflineMaps
    {maps}
    bind:open
    bind:onlyOffline
    onReady={(c) => { control = c }}
    onOpenChange={(e) => events.push(['openchange', e.open])}
    onComplete={(e) => events.push(['complete', e.region.name])}
  />
</Map>
