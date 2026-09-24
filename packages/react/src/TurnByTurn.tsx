import type { LatLngInput, TurnByTurnOptions } from 'ts-maps'
import { useEffect, useRef } from 'react'
import { TURN_BY_TURN_EVENTS, TurnByTurn as TsTurnByTurn } from 'ts-maps'
import { useMap } from './useMap'

/* eslint-disable no-unused-vars */
export interface TurnByTurnEventProps {
  /** Routes are on the map and the card is showing. */
  onPreview?: (e: any) => void
  onRouteSelect?: (e: any) => void
  /** Guidance began. */
  onStart?: (e: any) => void
  /** Every position: distance and time left, the next maneuver, lanes. */
  onProgress?: (e: any) => void
  /** Something was said, or would have been with the voice off. */
  onInstruction?: (e: any) => void
  onReroute?: (e: any) => void
  onArrive?: (e: any) => void
  /** Guidance ended — End was tapped, or `active` went false. */
  onEnd?: (e: any) => void
  onError?: (e: any) => void
}
/* eslint-enable no-unused-vars */

export interface TurnByTurnProps extends TurnByTurnEventProps {
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
  // eslint-disable-next-line no-unused-vars
  onReady?: (nav: TsTurnByTurn) => void
}

/**
 * Turn-by-turn navigation, after Apple Maps.
 *
 * ```tsx
 * <Map center={[37.79, -122.39]} zoom={13}>
 *   <TurnByTurn from={[37.7955, -122.3937]} to={[37.8029, -122.4484]} active={driving} onArrive={done} />
 * </Map>
 * ```
 *
 * Setting `from` and `to` previews the routes; `active` starts guidance.
 * Options are read when the component mounts; `from`, `to` and `active` are
 * followed as they change.
 */
export function TurnByTurn(props: TurnByTurnProps): null {
  const map = useMap()
  const navRef = useRef<TsTurnByTurn | null>(null)
  // The latest handlers, so a re-render with new callbacks is honoured
  // without re-subscribing.
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const { profile, units, voice, simulate, alternatives, destinationName, directions } = latest.current
    const nav = new TsTurnByTurn(map, { profile, units, voice, simulate, alternatives, destinationName, directions })
    for (const [event, prop] of Object.entries(TURN_BY_TURN_EVENTS))
      nav.on(event, (e: any) => (latest.current as any)[prop]?.(e))
    navRef.current = nav
    latest.current.onReady?.(nav)
    return () => {
      nav.stop()
      navRef.current = null
    }
  }, [map])

  const { from, to, active } = props
  const fromKey = JSON.stringify(from ?? null)
  const toKey = JSON.stringify(to ?? null)
  useEffect(() => {
    navRef.current?.sync({ from, to, active })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fromKey, toKey, active])

  return null
}
