// The two palettes the built-in styles are cut from.
//
// Light and dark share one layer skeleton (see `basemap.ts`) and differ only
// in this table, so a colour added to one is a compile error until it exists
// in the other. That is the whole point: the usual way a pair of themes drifts
// is one of them quietly gaining a layer the other never got.

export interface Palette {
  /** Ground beneath everything, including where no data has loaded. */
  background: string
  land: string
  /** Parks, forest, grass. */
  green: string
  water: string
  /** Motorways and trunk roads — the widest, brightest class. */
  roadMajor: string
  /** Everything else drivable. */
  roadMinor: string
  /** Outline drawn under a road so it separates from its surroundings. */
  roadCasing: string
  buildings: string
  boundary: string
  /** Place and road label ink. */
  label: string
  /** Halo behind label ink, so text survives crossing a road or a park. */
  labelHalo: string
  /** Secondary labels — smaller places, road names. */
  labelMuted: string
  /** Neighbourhood and district names, set small in capitals. */
  labelMinor: string
  /** Seas, lakes, rivers. */
  waterLabel: string
}

/**
 * Dark palette, tuned for data on top.
 *
 * Roads sit close to the background rather than reading as bright lines: on a
 * dark incident or fleet map the overlay is the subject, and a road network at
 * high contrast competes with it. Water is desaturated navy rather than blue
 * for the same reason — it should read as "not land" without pulling the eye.
 */
export const DARK: Palette = {
  background: '#12141a',
  land: '#171a21',
  green: '#18251c',
  water: '#0e1926',
  roadMajor: '#3a3f4b',
  roadMinor: '#282c35',
  roadCasing: '#0f1116',
  buildings: '#1d212a',
  boundary: '#2f3540',
  label: '#c8ccd4',
  labelHalo: '#0d0f13',
  labelMuted: '#8c93a1',
  labelMinor: '#7a8290',
  waterLabel: '#5f7fa3',
}

/**
 * Light palette, after the look of Apple Maps: warm paper ground, parks that
 * read as green and water that reads as blue, white roads lifted off the
 * ground by a soft casing, and near-black ink kept for the names that matter.
 */
export const LIGHT: Palette = {
  background: '#f5f3ee',
  land: '#f5f3ee',
  green: '#d4ebc4',
  water: '#a9d3f5',
  roadMajor: '#ffffff',
  roadMinor: '#ffffff',
  roadCasing: '#dedad1',
  buildings: '#e9e5dc',
  boundary: '#c9c3b8',
  label: '#1d1d1f',
  labelHalo: '#ffffff',
  labelMuted: '#6e6e73',
  labelMinor: '#86868b',
  waterLabel: '#3f7fbf',
}
