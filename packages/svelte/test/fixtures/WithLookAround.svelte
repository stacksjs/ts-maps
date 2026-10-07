<script lang="ts">
  // Slot content has to be authored in a component, so the control is
  // exercised through this rather than from a test file.
  import LookAround from '../../src/LookAround.svelte'
  import Map from '../../src/Map.svelte'
  import Search from '../../src/Search.svelte'

  export let provider: any
  export let events: Array<[string, unknown]> = []
  export let choosing = false
  export let at: [number, number] | undefined = undefined
  export let control: any = null
  export let search: any = undefined

  export function setChoosing(next: boolean): void {
    choosing = next
  }

  export function setAt(next: [number, number] | undefined): void {
    at = next
  }

  export function getControl(): any {
    return control
  }

  export function getSearch(): any {
    return search
  }

  export function state(): { choosing: boolean } {
    return { choosing }
  }
</script>

<Map center={[48.8601, 2.3370]} zoom={17}>
  <LookAround
    {provider}
    {at}
    miniMap={false}
    bind:choosing
    onReady={(c) => { control = c }}
    onOpen={(e) => events.push(['open', e.image.id])}
  />
  <Search provider={null} offline={null} recents={false} details={null} saved={null} lookAround={control} onReady={(c) => { search = c }} />
</Map>
