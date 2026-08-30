import type { IconAtlas, SpriteEntry } from './IconAtlas'

/**
 * Load a style's sprite sheet.
 *
 * A style document points at a sprite with a base URL and no extension —
 * `"sprite": "https://example.com/sprites/basic"` — from which two files are
 * derived: a JSON index of named icons and a PNG holding their pixels. Until
 * now `IconAtlas` required the caller to supply both by hand, which meant
 * `icon-image` did nothing for any real-world style.
 *
 * Retina sheets follow the `@2x` convention. The higher-density sheet is
 * preferred where the display can use it and quietly skipped where it cannot
 * be fetched, because a style is not obliged to publish one.
 */

/** The shape of an entry in a sprite JSON index. */
export interface SpriteIndexEntry {
  x: number
  y: number
  width: number
  height: number
  pixelRatio?: number
  /** Signed-distance icon: one shape, any `icon-color`. */
  sdf?: boolean
  content?: [number, number, number, number]
  stretchX?: Array<[number, number]>
  stretchY?: Array<[number, number]>
}

export type SpriteIndex = Record<string, SpriteIndexEntry>

export interface LoadSpriteOptions {
  /** Display density. Decides whether the `@2x` sheet is tried first. */
  pixelRatio?: number
  signal?: AbortSignal
  /** Swapped out in tests. Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch
  /**
   * Turn a URL into a decoded bitmap. Defaults to an `Image` load, which is
   * what a browser wants; a caller in another environment can supply its own.
   */
  loadImage?: (url: string) => Promise<CanvasImageSource & { width: number, height: number }>
}

export interface LoadedSprite {
  index: SpriteIndex
  image: CanvasImageSource & { width: number, height: number }
  /** Density of the sheet actually fetched, which may not be what was asked. */
  pixelRatio: number
}

/** `base` → `base@2x.png`, keeping any query string where it belongs. */
export function spriteUrl(base: string, extension: 'json' | 'png', pixelRatio: number): string {
  const suffix = pixelRatio > 1 ? '@2x' : ''
  const queryAt = base.indexOf('?')
  if (queryAt === -1)
    return `${base}${suffix}.${extension}`
  return `${base.slice(0, queryAt)}${suffix}.${extension}${base.slice(queryAt)}`
}

function defaultLoadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // The sheet is drawn into a canvas that is later read back, so it has to
    // arrive without tainting it.
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`failed to load sprite image ${url}`))
    image.src = url
  })
}

/**
 * Fetch the index and sheet for a sprite base URL.
 *
 * Falls back from `@2x` to 1x when the high-density sheet is missing, so a
 * style that only publishes one density still works on a retina screen.
 */
export async function loadSprite(base: string, options: LoadSpriteOptions = {}): Promise<LoadedSprite> {
  const doFetch = options.fetch ?? globalThis.fetch
  const loadImage = options.loadImage ?? (defaultLoadImage as LoadSpriteOptions['loadImage'])!
  const wanted = (options.pixelRatio ?? 1) > 1 ? 2 : 1

  const attempt = async (ratio: number): Promise<LoadedSprite> => {
    const response = await doFetch(spriteUrl(base, 'json', ratio), { signal: options.signal })
    if (!response.ok)
      throw new Error(`HTTP ${response.status} fetching sprite index for ${base}`)

    const index = await response.json() as SpriteIndex
    const image = await loadImage(spriteUrl(base, 'png', ratio))
    return { index, image, pixelRatio: ratio }
  }

  if (wanted === 2) {
    try {
      return await attempt(2)
    }
    catch {
      // No @2x sheet published, or it failed to load. 1x still looks right,
      // just softer — better than no icons at all.
    }
  }

  return attempt(1)
}

/**
 * Push a loaded sprite's icons into an atlas.
 *
 * Entries carry their own `pixelRatio` in Mapbox's format; where one is
 * missing the sheet's density stands in, so a `@2x` sheet does not render at
 * double size.
 *
 * `prefix` namespaces the ids, for the multi-sheet form of `sprite`.
 */
export function addSpriteToAtlas(atlas: IconAtlas, sprite: LoadedSprite, prefix?: string): number {
  let added = 0

  for (const [name, entry] of Object.entries(sprite.index)) {
    // A style may declare several sheets, in which case `icon-image` names an
    // icon as `sheet:icon`. Prefixing on the way into the atlas keeps that a
    // detail of loading rather than something the renderer has to know.
    const id = prefix ? `${prefix}:${name}` : name
    if (!entry || typeof entry.width !== 'number' || typeof entry.height !== 'number')
      continue
    if (entry.width <= 0 || entry.height <= 0)
      continue

    const packed: SpriteEntry = {
      id,
      x: entry.x,
      y: entry.y,
      width: entry.width,
      height: entry.height,
      pixelRatio: entry.pixelRatio ?? sprite.pixelRatio,
      sdf: entry.sdf === true,
    }

    // The atlas copies out of the sheet at the entry's own rectangle, so the
    // whole sheet is handed over each time rather than sliced first.
    atlas.addSprite(packed, sprite.image as HTMLImageElement)
    added += 1
  }

  return added
}
