import type { JSX } from 'solid-js'
import type { LatLngInput, TurnByTurnOptions } from 'ts-maps'
import { createEffect, onCleanup } from 'solid-js'
import { TURN_BY_TURN_EVENTS, TurnByTurn as TsTurnByTurn } from 'ts-maps'
import { useMap } from './context'

/* eslint-disable no-unused-vars */
export interface TurnByTurnProps {
  /** Where the trip starts, `[lat, lng]` or `{ lat, lng }`. */
  from?: LatLngInput | null
  /** Where it ends. With both set, the routes between them are previewed. */
  to?: LatLngInput | null
  /** Guide along the chosen route. Off returns to the preview. */
  active?: boolean
  profile?: TurnByTurnOptions['profile']
  units?: TurnByTurnOptions['units']
  voice?: boolean
  simulate?: TurnByTurnOptions['simulate']
  alternatives?: boolean
  destinationName?: string
  directions?: TurnByTurnOptions['directions']
  /** The underlying `TurnByTurn`, for `selectRoute`, `recenter` and `update`. */
  onReady?: (nav: TsTurnByTurn) => void
  onPreview?: (e: any) => void
  onRouteSelect?: (e: any) => void
  onStart?: (e: any) => void
  onProgress?: (e: any) => void
  onInstruction?: (e: any) => void
  onReroute?: (e: any) => void
  onArrive?: (e: any) => void
  onEnd?: (e: any) => void
  onError?: (e: any) => void
}
/* eslint-enable no-unused-vars */

/**
 * Turn-by-turn navigation, after Apple Maps.
 *
 * ```tsx
 * <Map center={[37.79, -122.39]} zoom={13}>
 *   <TurnByTurn from={[37.7955, -122.3937]} to={[37.8029, -122.4484]} active={driving()} />
 * </Map>
 * ```
 *
 * Setting `from` and `to` previews the routes; `active` starts guidance.
 * Every prop is followed as it changes.
 */
export function TurnByTurn(props: TurnByTurnProps): JSX.Element {
  let nav: TsTurnByTurn | null = null

  // One effect for both: the map arrives through a signal, and every prop is
  // read here too, so a change to either brings the navigation into line —
  // whichever comes first. Another `profile` or `directions` fetches a
  // showing preview again; places are compared by value, so an unchanged
  // trip is not fetched again when another prop changes.
  createEffect(() => {
    const map = useMap()
    const target = {
      from: props.from,
      to: props.to,
      active: props.active,
      profile: props.profile,
      units: props.units,
      voice: props.voice,
      simulate: props.simulate,
      alternatives: props.alternatives,
      destinationName: props.destinationName,
      directions: props.directions,
    }
    if (!map)
      return
    if (!nav) {
      nav = new TsTurnByTurn(map, {
        profile: target.profile,
        units: target.units,
        voice: target.voice,
        simulate: target.simulate,
        alternatives: target.alternatives,
        destinationName: target.destinationName,
        directions: target.directions,
      })
      for (const [event, prop] of Object.entries(TURN_BY_TURN_EVENTS))
        nav.on(event, (e: any) => (props as any)[prop]?.(e))
      props.onReady?.(nav)
    }
    nav.sync(target)
  })

  onCleanup(() => {
    nav?.stop()
    nav = null
  })

  return null as unknown as JSX.Element
}
