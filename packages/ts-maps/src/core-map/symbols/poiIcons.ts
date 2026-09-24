import type { IconAtlas, SpriteEntry } from './IconAtlas'

/**
 * Built-in point-of-interest icons, after Apple Maps: a round badge in the
 * category's colour with a white glyph, and a white rim that lifts it off the
 * map. Drawn here rather than shipped as a sprite sheet, so the built-in
 * styles need no assets and every badge is rendered at the screen's own
 * resolution.
 *
 * A style asks for one by name — `tsmap-poi-food`, `tsmap-poi-park` — and the
 * icon atlas draws it the first time it is asked for (see `builtinIcon`).
 */

export interface PoiCategory {
  /** Badge colour. */
  color: string
  /** Label ink on a light map: the badge colour, a shade deeper. */
  textLight: string
  /** Label ink on a dark map: a shade lighter. */
  textDark: string
  /** Glyph, as SVG path data on a 24-unit grid, filled even-odd. */
  glyph: string
}

export const POI_CATEGORIES: Record<string, PoiCategory> = {
  food: {
    color: '#ff9500',
    textLight: '#c96a00',
    textDark: '#ffb340',
    // Fork and knife.
    glyph: 'M6.5 3h1v5.5h1V3h1v5.5h1V3h1v6.5a2.5 2.5 0 0 1-2 2.45V21h-1.5v-9.05a2.5 2.5 0 0 1-2-2.45Z M16 3c1.8 1.2 2.5 3.6 2.5 7v2H17v9h-1.5V3Z',
  },
  cafe: {
    color: '#c7843d',
    textLight: '#95602a',
    textDark: '#e0a567',
    // Cup and saucer.
    glyph: 'M5 7h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z M16 8h1.5a2.5 2.5 0 0 1 0 5H16v-1.6h1.5a0.9 0.9 0 0 0 0-1.8H16Z M4 18.5h13V20H4Z',
  },
  nightlife: {
    color: '#af52de',
    textLight: '#8a3cb3',
    textDark: '#cf8cf0',
    // Cocktail glass.
    glyph: 'M4.5 4h15l-6.5 7.5V18h3.5v2h-9v-2H11v-6.5Z',
  },
  shopping: {
    color: '#f7b500',
    textLight: '#b07f00',
    textDark: '#ffcf4d',
    // Shopping bag.
    glyph: 'M5.5 8h13l-1 12.5h-11Z M8.5 8V7a3.5 3.5 0 0 1 7 0v1H14V7a2 2 0 0 0-4 0v1Z',
  },
  grocery: {
    color: '#f7b500',
    textLight: '#b07f00',
    textDark: '#ffcf4d',
    // Trolley.
    glyph: 'M2.5 4h3.2l.6 2H21l-2.6 8.5H8.3l.4 1.5H19v1.8H7.3L4.4 5.8H2.5Z M9 18.4a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 1 1 0-3.2Z M17 18.4a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 1 1 0-3.2Z',
  },
  park: {
    color: '#34c759',
    textLight: '#248a3d',
    textDark: '#5fdc7d',
    // Tree.
    glyph: 'M12 2.5l6.5 8.5h-3.2l4.2 5.5H13v5h-2v-5H4.5l4.2-5.5H5.5Z',
  },
  transit: {
    color: '#007aff',
    textLight: '#0062cc',
    textDark: '#4aa3ff',
    // Bus, windscreen and headlights cut out.
    glyph: 'M6 3.5h12a2 2 0 0 1 2 2v11.5h-1v2h-2.5v-2h-9v2H5v-2H4V5.5a2 2 0 0 1 2-2Z M6 6.5v5h12v-5Z M6.5 14a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z M15.5 14a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z',
  },
  health: {
    color: '#ff3b30',
    textLight: '#d70015',
    textDark: '#ff6961',
    // Cross.
    glyph: 'M9.75 3.5h4.5v6.25h6.25v4.5h-6.25v6.25h-4.5v-6.25H3.5v-4.5h6.25Z',
  },
  education: {
    color: '#a2845e',
    textLight: '#7d6446',
    textDark: '#c9ab84',
    // Mortarboard.
    glyph: 'M12 4l10.5 5L12 14 1.5 9Z M6 12v4c0 1.6 2.7 3.2 6 3.2s6-1.6 6-3.2v-4l-6 2.9Z',
  },
  lodging: {
    color: '#5856d6',
    textLight: '#3634a3',
    textDark: '#8886ff',
    // Bed.
    glyph: 'M2.5 6h2v6.5h15a2 2 0 0 1 2 2V19h-2v-2h-15v2h-2Z M7.5 8.3a1.9 1.9 0 1 1 0 3.8a1.9 1.9 0 1 1 0-3.8Z M10.5 8.5h7.5a2 2 0 0 1 2 2V11.5h-9.5Z',
  },
  culture: {
    color: '#ff2d55',
    textLight: '#d30f45',
    textDark: '#ff6482',
    // Star.
    glyph: 'M12 2.8l2.7 5.7 6.2.8-4.6 4.3 1.2 6.2L12 16.8l-5.5 3 1.2-6.2-4.6-4.3 6.2-.8Z',
  },
  sports: {
    color: '#30b0c7',
    textLight: '#0f7f92',
    textDark: '#5ecde0',
    // Ball.
    glyph: 'M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17Z M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z M11 6h2v12h-2Z M6 11h12v2H6Z',
  },
  civic: {
    color: '#8e8e93',
    textLight: '#636366',
    textDark: '#aeaeb2',
    // Pillared building.
    glyph: 'M12 3l9 4.5V9H3V7.5Z M5 10h2.5v7H5Z M10.75 10h2.5v7h-2.5Z M16.5 10H19v7h-2.5Z M3 18h18v2.5H3Z',
  },
  worship: {
    color: '#8e8e93',
    textLight: '#636366',
    textDark: '#aeaeb2',
    // Building with a spire.
    glyph: 'M11.25 2.5h1.5V5h2.25v1.5h-2.25v2.3L18 12v8.5h-4v-3a2 2 0 0 0-4 0v3H6V12l5.25-3.2V6.5H9V5h2.25Z',
  },
  car: {
    color: '#007aff',
    textLight: '#0062cc',
    textDark: '#4aa3ff',
    // Fuel pump.
    glyph: 'M5 3.5h9v17H5Z M7 6v4.5h5V6Z M15 6.5l3.5 3.5v7a1.75 1.75 0 0 1-3.5 0v-3h1.5v3a.25.25 0 0 0 .5 0v-6.4L15 8.6Z',
  },
  place: {
    color: '#8e8e93',
    textLight: '#636366',
    textDark: '#aeaeb2',
    // Dot.
    glyph: 'M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8Z',
  },
}

/**
 * OpenMapTiles `poi` classes, by category. Anything not listed falls back to
 * `place`.
 */
export const POI_CLASSES: Record<string, string[]> = {
  food: ['restaurant', 'fast_food', 'bakery', 'ice_cream', 'food_court'],
  cafe: ['cafe'],
  nightlife: ['bar', 'beer', 'pub', 'alcohol_shop', 'nightclub'],
  shopping: ['shop', 'clothing_store', 'jewelry', 'gift', 'books', 'electronics', 'furniture', 'hardware', 'mall', 'department_store'],
  grocery: ['grocery', 'supermarket', 'convenience'],
  park: ['park', 'garden', 'playground', 'zoo', 'campsite', 'dog_park', 'picnic_site'],
  transit: ['bus', 'railway', 'ferry_terminal', 'aerialway', 'harbor', 'airport'],
  health: ['hospital', 'pharmacy', 'doctors', 'dentist', 'veterinary', 'clinic'],
  education: ['school', 'college', 'library', 'kindergarten', 'university'],
  lodging: ['lodging', 'hotel', 'hostel', 'motel'],
  culture: ['attraction', 'museum', 'art_gallery', 'theatre', 'cinema', 'music', 'monument', 'castle'],
  sports: ['stadium', 'sports', 'golf', 'swimming', 'pitch', 'fitness', 'ice_rink'],
  civic: ['town_hall', 'police', 'fire_station', 'post', 'bank', 'embassy', 'office', 'prison'],
  worship: ['place_of_worship', 'religion', 'cemetery'],
  car: ['fuel', 'parking', 'car', 'bicycle', 'bicycle_rental', 'charging_station'],
}

/** Prefix for built-in icon names. */
export const POI_ICON_PREFIX = 'tsmap-poi-'

/** Badge size, CSS pixels, rim included. */
export const POI_ICON_SIZE = 22
/** Room around the badge for its shadow. */
const PAD = 2
/** Pixel density the badges are drawn at. */
const RATIO = 3

/**
 * Draw one badge into a fresh canvas, at `RATIO` times its CSS size.
 * `null` where there is no 2D canvas to draw with.
 */
export function drawPoiIcon(category: PoiCategory): HTMLCanvasElement | null {
  if (typeof document === 'undefined')
    return null
  const css = POI_ICON_SIZE + PAD * 2
  const canvas = document.createElement('canvas')
  canvas.width = css * RATIO
  canvas.height = css * RATIO
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return null

  ctx.scale(RATIO, RATIO)
  const c = css / 2
  const r = POI_ICON_SIZE / 2

  // White rim, with a soft shadow under it.
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'
  ctx.shadowBlur = 2
  ctx.shadowOffsetY = 0.5
  ctx.beginPath()
  ctx.arc(c, c, r, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()

  // The badge.
  ctx.beginPath()
  ctx.arc(c, c, r - 1.5, 0, Math.PI * 2)
  ctx.fillStyle = category.color
  ctx.fill()

  // The glyph: the 24-unit grid scaled to a little over half the badge.
  if (typeof Path2D === 'function') {
    const glyph = (r - 1.5) * 1.15
    ctx.save()
    ctx.translate(c - glyph / 2, c - glyph / 2)
    ctx.scale(glyph / 24, glyph / 24)
    ctx.fillStyle = '#ffffff'
    try {
      ctx.fill(new Path2D(category.glyph), 'evenodd')
    }
    catch {
      // A canvas without Path2D support keeps the plain badge.
    }
    ctx.restore()
  }
  return canvas
}

/**
 * The atlas entry for a built-in icon, drawing and adding it on first use.
 * `undefined` for a name that is not one of ours, so a style's own sprite
 * sheet is never shadowed.
 */
export function builtinIcon(atlas: IconAtlas, id: string): SpriteEntry | undefined {
  const existing = atlas.get(id)
  if (existing || !id.startsWith(POI_ICON_PREFIX))
    return existing
  const category = POI_CATEGORIES[id.slice(POI_ICON_PREFIX.length)]
  if (!category)
    return undefined
  const canvas = drawPoiIcon(category)
  if (!canvas)
    return undefined
  atlas.addSprite({ id, x: 0, y: 0, width: canvas.width, height: canvas.height, pixelRatio: RATIO }, canvas)
  return atlas.get(id)
}

/** A style expression mapping an OpenMapTiles `class` to a category name. */
export function poiCategoryExpression(): unknown[] {
  const expression: unknown[] = ['match', ['get', 'class']]
  for (const [category, classes] of Object.entries(POI_CLASSES))
    expression.push(classes, category)
  expression.push('place')
  return expression
}

/** A style expression mapping an OpenMapTiles `class` to one of the category's colours. */
export function poiColorExpression(pick: (category: PoiCategory) => string): unknown[] {
  const expression: unknown[] = ['match', ['get', 'class']]
  for (const [category, classes] of Object.entries(POI_CLASSES))
    expression.push(classes, pick(POI_CATEGORIES[category]!))
  expression.push(pick(POI_CATEGORIES.place!))
  return expression
}
