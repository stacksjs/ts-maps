<script lang="ts">
  // Slot content has to be authored in a component, so navigation is
  // exercised through this rather than from a test file.
  import type { TurnByTurnOptions } from 'ts-maps'
  import Map from '../../src/Map.svelte'
  import TurnByTurn from '../../src/TurnByTurn.svelte'

  export let directions: any
  export let from: [number, number]
  export let to: [number, number]
  export let events: string[] = []
  let active = false
  let profile: TurnByTurnOptions['profile']

  export function setProfile(value: TurnByTurnOptions['profile']): void {
    profile = value
  }

  export function setDirections(value: any): void {
    directions = value
  }

  export function setActive(value: boolean): void {
    active = value
  }
</script>

<Map center={from} zoom={15}>
  <TurnByTurn
    {from}
    {to}
    {active}
    {directions}
    {profile}
    voice={false}
    onPreview={() => events.push('preview')}
    onStart={() => events.push('start')}
    onEnd={() => events.push('end')}
  />
</Map>
