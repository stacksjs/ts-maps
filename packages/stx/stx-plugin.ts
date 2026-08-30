/**
 * stx plugin shim for @ts-maps/stx.
 *
 * Register it in a project's stx config to make every map component
 * (`<Map>`, `<Marker>`, `<NavigationControl>`, …) resolvable by tag name:
 *
 * ```ts
 * // stx.config.ts
 * export default {
 *   plugins: ['@ts-maps/stx/stx-plugin'],
 * }
 * ```
 *
 * The map's stylesheet is not injected here — a plugin cannot know where a
 * project puts its CSS. Link it once in your layout:
 *
 * ```html
 * <link rel="stylesheet" href="/ts-maps.css">
 * ```
 *
 * or import `@ts-maps/stx/styles.css` from wherever your app collects CSS.
 */
export default {
  name: '@ts-maps/stx',
  components: ['./src'],
}
