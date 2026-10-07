<script lang="ts">
  // Slot content has to be authored in a component, so the control is
  // exercised through this rather than from a test file.
  import Map from '../../src/Map.svelte'
  import MapType from '../../src/MapType.svelte'

  export let types: any
  export let events: Array<[string, unknown]> = []
  export let value = 'explore'
  export let open = false
  export let traffic: any = undefined
  export let showTraffic = false
  export let control: any = null

  export function setValue(next: string): void {
    value = next
  }

  export function setOpen(next: boolean): void {
    open = next
  }

  export function setShowTraffic(next: boolean): void {
    showTraffic = next
  }

  export function getControl(): any {
    return control
  }

  export function state(): { value: string, open: boolean, showTraffic: boolean } {
    return { value, open, showTraffic }
  }
</script>

<Map center={[37.78, -122.42]} zoom={13}>
  <MapType
    {types}
    {traffic}
    bind:value
    bind:open
    bind:showTraffic
    onReady={(c) => { control = c }}
    onChange={(e) => events.push(['change', e.value])}
    onOpenChange={(e) => events.push(['openchange', e.open])}
    onTrafficChange={(e) => events.push(['trafficchange', e.traffic])}
  />
</Map>
