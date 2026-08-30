// Resolving a signed-distance icon to pixels.
//
// An SDF sprite stores distance from the shape's edge in its alpha channel
// rather than the icon's own colours, encoded so that 0.5 is the edge itself.
// Two things follow from that, and they are the reason the format is worth
// supporting: one grey shape can be drawn in any colour a style asks for, and
// the edge is recovered by thresholding rather than resampled from pixels, so
// it stays sharp however far the icon is scaled up.
//
// The work is kept here, apart from `IconAtlas`, because it is arithmetic over
// a buffer and nothing more. The atlas reads pixels out of a canvas and writes
// them back; that part needs a browser. This part can be tested against
// hand-built fields, which is where the behaviour worth checking actually
// lives.

export interface SdfRenderOptions {
  /** Fill colour, as any CSS notation `parseColor` understands. */
  color: string
  haloColor?: string
  /** Halo width in icon pixels. Zero, or absent, means no halo. */
  haloWidth?: number
}

/**
 * Colour one distance field.
 *
 * `field` is RGBA, of which only alpha is read. The result is RGBA the same
 * size, ready to hand to `putImageData`.
 */
export function renderSdfPixels(
  field: Uint8ClampedArray,
  width: number,
  height: number,
  options: SdfRenderOptions,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  const fill = parseColor(options.color)
  const haloWidth = options.haloWidth ?? 0
  // A halo needs both a colour and a width. The spec's default halo colour is
  // fully transparent black, so a style that sets only the colour is asking
  // for nothing — drawing it would ring every icon in black.
  const halo = options.haloColor && haloWidth > 0 ? parseColor(options.haloColor) : null

  // Mapbox's generator spreads the field over roughly 8 pixels either side of
  // the edge, which is what turns a halo width in pixels into a threshold. The
  // band is the width of the antialiased edge: narrow enough to look crisp,
  // wide enough not to stair-step.
  const haloEdge = halo ? Math.max(0.02, 0.5 - haloWidth / 16) : 0
  const band = 0.06

  for (let i = 0; i < width * height; i++) {
    const distance = field[i * 4 + 3] / 255
    const inside = smoothstep(0.5 - band, 0.5 + band, distance)
    const outline = halo ? smoothstep(haloEdge - band, haloEdge + band, distance) : 0

    // Fill over halo. Compositing them this way round means the two blend
    // where they meet, rather than the halo cutting a ring out of the shape.
    const alpha = inside + outline * (1 - inside)
    if (alpha <= 0)
      continue

    const weight = outline * (1 - inside)
    out[i * 4] = halo ? (fill[0] * inside + halo[0] * weight) / alpha : fill[0]
    out[i * 4 + 1] = halo ? (fill[1] * inside + halo[1] * weight) / alpha : fill[1]
    out[i * 4 + 2] = halo ? (fill[2] * inside + halo[2] * weight) / alpha : fill[2]
    out[i * 4 + 3] = Math.round(alpha * 255)
  }

  return out
}

/** Hermite interpolation between two edges, as in the GLSL builtin. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0)
    return x < edge0 ? 0 : 1
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * A CSS colour as RGB.
 *
 * Hex and `rgb()`/`rgba()` cover what styles actually write and are parsed
 * directly. Anything else — a named colour, `hsl()` — goes through a canvas,
 * which knows every notation CSS does and saves shipping a colour parser to
 * handle the long tail.
 */
export function parseColor(color: string): [number, number, number] {
  const text = color.trim()

  const hex = /^#([0-9a-f]{3,8})$/i.exec(text)
  if (hex) {
    let body = hex[1]
    if (body.length === 3 || body.length === 4)
      body = body.slice(0, 3).split('').map(c => c + c).join('')
    if (body.length < 6)
      return [0, 0, 0]
    const n = Number.parseInt(body.slice(0, 6), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(text)
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean)
    if (parts.length >= 3) {
      const channel = (value: string): number => {
        const n = Number.parseFloat(value)
        if (Number.isNaN(n))
          return 0
        // Percentages are legal in every position.
        return Math.max(0, Math.min(255, Math.round(value.includes('%') ? (n / 100) * 255 : n)))
      }
      return [channel(parts[0]), channel(parts[1]), channel(parts[2])]
    }
  }

  return probeColor(text)
}

/** Last resort: let the canvas resolve a notation we don't parse ourselves. */
function probeColor(color: string): [number, number, number] {
  if (typeof document === 'undefined')
    return [0, 0, 0]

  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const ctx = probe.getContext('2d')
  if (!ctx)
    return [0, 0, 0]

  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  try {
    const data = ctx.getImageData(0, 0, 1, 1).data
    return [data[0], data[1], data[2]]
  }
  catch {
    return [0, 0, 0]
  }
}
