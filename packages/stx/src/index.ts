/**
 * Programmatic surface for `@ts-maps/stx`.
 *
 * The components themselves are `.stx` files resolved by tag name — register
 * `@ts-maps/stx/stx-plugin` and write `<Map>`, `<Marker>` and the rest
 * directly. What this module exports is the runtime behind them, which is also
 * what you reach for when a page needs the map it rendered:
 *
 * ```ts
 * import { findMap, onMapEvent } from '@ts-maps/stx'
 *
 * onMount(() => {
 *   const map = findMap(el.value)
 *   onDestroy(onMapEvent(el.value, 'moveend', () => console.log(map.getCenter())))
 * })
 * ```
 */

export {
  CHILD_ATTRIBUTE,
  definedOnly,
  findMap,
  type MapProps,
  mapOptionsFrom,
  type MapEventHandler,
  mountChildren,
  onMapEvent,
  publishMap,
  readJson,
  unpublishMap,
} from './runtime'
