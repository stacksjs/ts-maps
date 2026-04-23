// Minimal CSS color parser — zero-dep. Handles the forms that show up in
// map styles: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(...)`, `rgba(...)`,
// `hsl(...)`, `hsla(...)`, and the CSS named-color table. Output is RGBA in
// [0..1] float space — convenient for channel-wise lerping and for handing
// off to canvas via `rgba(r,g,b,a)` with the channels multiplied by 255.
//
// sRGB linearity: we interpolate directly in sRGB space. That's what Mapbox
// GL JS does today, so style output matches. Proper linear-light blending is
// a follow-up.

import type { RGBA } from './types'

// ---------- CSS named colors ----------

// The canonical CSS3 named-color table. Kept as a sparse record keyed by the
// lowercase name so lookup is O(1). Hex strings are parsed lazily on first
// hit; after that the tuple is cached to avoid re-parsing the same name.
const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dimgrey: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  grey: '#808080',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  steelblue: '#4682b4',
  slateblue: '#6a5acd',
  slategray: '#708090',
  slategrey: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  transparent: 'rgba(0,0,0,0)',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32',
}

// ---------- parsing helpers ----------

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n
}

// Parse a hex digit character (0–9, a–f, A–F) into its integer value. Returns
// NaN on any other input so callers can detect malformed hex strings cheaply.
function hexDigit(ch: string): number {
  const c = ch.charCodeAt(0)
  if (c >= 48 && c <= 57) return c - 48 // '0'..'9'
  if (c >= 97 && c <= 102) return c - 87 // 'a'..'f'
  if (c >= 65 && c <= 70) return c - 55 // 'A'..'F'
  return Number.NaN
}

function parseHex(hex: string): RGBA | null {
  // `hex` comes in without the `#` prefix. Accept 3, 4, 6, or 8 digit forms.
  const len = hex.length
  if (len === 3 || len === 4) {
    const r = hexDigit(hex[0]!)
    const g = hexDigit(hex[1]!)
    const b = hexDigit(hex[2]!)
    const a = len === 4 ? hexDigit(hex[3]!) : 15
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) return null
    return [(r * 17) / 255, (g * 17) / 255, (b * 17) / 255, (a * 17) / 255]
  }
  if (len === 6 || len === 8) {
    const r = (hexDigit(hex[0]!) << 4) | hexDigit(hex[1]!)
    const g = (hexDigit(hex[2]!) << 4) | hexDigit(hex[3]!)
    const b = (hexDigit(hex[4]!) << 4) | hexDigit(hex[5]!)
    const a = len === 8 ? ((hexDigit(hex[6]!) << 4) | hexDigit(hex[7]!)) : 255
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) return null
    return [r / 255, g / 255, b / 255, a / 255]
  }
  return null
}

// Parse one channel component from an rgb()/rgba() argument list. Accepts
// either an integer 0..255 or a percentage (trailing `%`). Returns NaN on
// parse failure so the caller can reject the whole color.
function parseRgbComponent(input: string): number {
  const s = input.trim()
  if (s.endsWith('%')) {
    const n = Number.parseFloat(s.slice(0, -1))
    if (Number.isNaN(n)) return Number.NaN
    return clamp01(n / 100)
  }
  const n = Number.parseFloat(s)
  if (Number.isNaN(n)) return Number.NaN
  return clampByte(n) / 255
}

function parseAlpha(input: string): number {
  const s = input.trim()
  if (s.endsWith('%')) {
    const n = Number.parseFloat(s.slice(0, -1))
    if (Number.isNaN(n)) return Number.NaN
    return clamp01(n / 100)
  }
  const n = Number.parseFloat(s)
  if (Number.isNaN(n)) return Number.NaN
  return clamp01(n)
}

// Convert HSL (hue in degrees, sat/light in 0..1) to RGB in 0..1.
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  // Normalise hue into [0, 360).
  const hn = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hn < 60) {
    r = c
    g = x
    b = 0
  }
  else if (hn < 120) {
    r = x
    g = c
    b = 0
  }
  else if (hn < 180) {
    r = 0
    g = c
    b = x
  }
  else if (hn < 240) {
    r = 0
    g = x
    b = c
  }
  else if (hn < 300) {
    r = x
    g = 0
    b = c
  }
  else {
    r = c
    g = 0
    b = x
  }
  return [clamp01(r + m), clamp01(g + m), clamp01(b + m)]
}

// Split the body of `fn(a, b, c)` / `fn(a b c / d)` into its arguments. Covers
// the modern whitespace-separated form as well as the legacy comma form.
function splitArgs(body: string): string[] {
  // Prefer comma separation when any comma is present — that's the most common
  // form in real-world styles and the legacy-safe path.
  if (body.includes(','))
    return body.split(',').map(s => s.trim()).filter(s => s.length > 0)
  // Slash separates alpha in the modern syntax: `rgb(255 0 0 / 0.5)`.
  const slashIdx = body.indexOf('/')
  const main = slashIdx >= 0 ? body.slice(0, slashIdx) : body
  const alpha = slashIdx >= 0 ? body.slice(slashIdx + 1) : ''
  const parts = main.trim().split(/\s+/).filter(s => s.length > 0)
  if (alpha.trim().length > 0) parts.push(alpha.trim())
  return parts
}

// ---------- public surface ----------

/**
 * Parse a CSS color string into an RGBA tuple with float channels in [0..1].
 * Returns null if the string can't be recognised — callers decide whether to
 * treat that as an error or substitute a default.
 */
export function parseColor(css: string): RGBA | null {
  if (typeof css !== 'string') return null
  const s = css.trim().toLowerCase()
  if (s.length === 0) return null

  if (s.startsWith('#'))
    return parseHex(s.slice(1))

  const openIdx = s.indexOf('(')
  if (openIdx > 0 && s.endsWith(')')) {
    const fn = s.slice(0, openIdx)
    const body = s.slice(openIdx + 1, -1)
    const args = splitArgs(body)

    if (fn === 'rgb' || fn === 'rgba') {
      if (args.length < 3 || args.length > 4) return null
      const r = parseRgbComponent(args[0]!)
      const g = parseRgbComponent(args[1]!)
      const b = parseRgbComponent(args[2]!)
      const a = args.length === 4 ? parseAlpha(args[3]!) : 1
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) return null
      return [r, g, b, a]
    }

    if (fn === 'hsl' || fn === 'hsla') {
      if (args.length < 3 || args.length > 4) return null
      const hRaw = args[0]!.trim()
      const h = Number.parseFloat(hRaw.endsWith('deg') ? hRaw.slice(0, -3) : hRaw)
      const sStr = args[1]!.trim()
      const lStr = args[2]!.trim()
      if (!sStr.endsWith('%') || !lStr.endsWith('%')) return null
      const sat = Number.parseFloat(sStr.slice(0, -1)) / 100
      const lig = Number.parseFloat(lStr.slice(0, -1)) / 100
      if (Number.isNaN(h) || Number.isNaN(sat) || Number.isNaN(lig)) return null
      const [r, g, b] = hslToRgb(h, clamp01(sat), clamp01(lig))
      const a = args.length === 4 ? parseAlpha(args[3]!) : 1
      if (Number.isNaN(a)) return null
      return [r, g, b, a]
    }

    return null
  }

  // Named color? Recurse once — named table entries are themselves CSS forms.
  const named = NAMED_COLORS[s]
  if (named !== undefined)
    return parseColor(named)

  return null
}

/**
 * Linearly blend two RGBA tuples in straight sRGB. t is clamped to [0..1].
 */
export function lerpColor(a: RGBA, b: RGBA, t: number): RGBA {
  const u = t < 0 ? 0 : t > 1 ? 1 : t
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
    a[3] + (b[3] - a[3]) * u,
  ]
}

/**
 * Render an RGBA tuple as a CSS `rgba(...)` string. Used mainly for diagnostic
 * output and as the canonical wire form when handing colors to canvas.
 */
export function formatColor(c: RGBA): string {
  const r = Math.round(clamp01(c[0]) * 255)
  const g = Math.round(clamp01(c[1]) * 255)
  const b = Math.round(clamp01(c[2]) * 255)
  const a = clamp01(c[3])
  // Drop trailing zeros on alpha so the common fully-opaque case reads `1`.
  const aStr = a === 1 ? '1' : String(Number(a.toFixed(4)))
  return `rgba(${r},${g},${b},${aStr})`
}
