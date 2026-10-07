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
  export let resources: string[] | undefined = undefined
  let position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright' | undefined

  export function setOpen(value: boolean): void {
    open = value
  }

  export function setOnlyOffline(value: boolean): void {
    onlyOffline = value
  }

  export function setMaps(value: any): void {
    maps = value
  }

  export function setPosition(value: typeof position): void {
    position = value
  }

  export function getControl(): any {
    return control
  }

  export function state(): { open: boolean, onlyOffline: boolean } {
    return { open, onlyOffline }
  }
</script>

<Map center={[37.78, -122.42]} zoom={15}>
  <OfflineMaps
    {maps}
    {resources}
    {position}
    bind:open
    bind:onlyOffline
    onReady={(c) => { control = c }}
    onOpenChange={(e) => events.push(['openchange', e.open])}
    onProgress={(e) => events.push(['progress', e.from])}
    onComplete={(e) => events.push(['complete', e.region.name])}
  />
</Map>
