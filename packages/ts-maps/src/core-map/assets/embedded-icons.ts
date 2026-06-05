/**
 * Bundled raster icons as data URIs so `import 'ts-maps/styles.css'` and
 * `new Marker()` work without shipping a separate images/ directory (bundlers
 * cannot resolve `url(images/*.svg)` in CSS).
 */

/** Classic map pin (Leaflet-compatible proportions). */
export const MARKER_ICON_DATA_URI =
  'data:image/svg+xml,'
  + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">'
    + '<path fill="#2b83f6" stroke="#1e5fad" stroke-width="1" d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z"/>'
    + '<circle cx="12.5" cy="12.5" r="5" fill="#fff"/>'
    + '</svg>',
  )

/** Soft drop shadow under the default pin. */
export const MARKER_SHADOW_DATA_URI =
  'data:image/svg+xml,'
  + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="41" height="41" viewBox="0 0 41 41">'
    + '<ellipse cx="20.5" cy="31" rx="14" ry="6" fill="#000" opacity="0.28"/>'
    + '</svg>',
  )

/** Layers control toggle (stacked tiles). */
export const LAYERS_TOGGLE_DATA_URI =
  'data:image/svg+xml,'
  + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">'
    + '<rect x="4" y="4" width="14" height="14" fill="#fff" stroke="#666" stroke-width="1.5"/>'
    + '<rect x="10" y="10" width="14" height="14" fill="#e8e8e8" stroke="#666" stroke-width="1.5"/>'
    + '<rect x="16" y="16" width="14" height="14" fill="#d0d0d0" stroke="#666" stroke-width="1.5"/>'
    + '</svg>',
  )
