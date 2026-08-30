// Who owns what, and what changes when someone closes a loop.
//
// The rules this encodes are the ones that make the game a game:
//
//   - A loop you close is added to what you already hold. Two laps of adjacent
//     blocks become one territory, not two, and the shared border disappears.
//   - Ground inside your loop that someone else held becomes yours. That is
//     the whole reason to run somewhere rather than anywhere.
//   - Nobody holds the same square metre twice, so the totals always add up —
//     which matters, because those totals are the scoreboard.
//
// Every capture reports what it changed: area gained, and who lost what. A
// player wants to be told "you took 12,000 m² off Sam", not left to compare
// two leaderboards.

import type { MultiPolygon, Position, Ring } from '../geo/polygonClip'
import { Evented } from '../core/Events'
import { multiPolygonArea, ringArea } from '../geo/area'
import { contains, difference, intersection, union } from '../geo/polygonClip'
import { prepareClaim } from '../geo/validate'

export interface TerritoryStoreOptions {
  /**
   * Whether a capture takes ground from other owners. With this off,
   * territories may overlap and each owner's total counts ground others also
   * hold — a co-operative mode rather than a competitive one.
   */
  steal?: boolean
  /**
   * Smallest fragment worth keeping, in square metres. Boolean operations on
   * GPS-derived shapes leave slivers along borders that are too small to see
   * and not free to carry; dropping them keeps the shapes honest.
   */
  minFragmentArea?: number
}

export interface StolenFrom {
  owner: string
  /** Square metres taken from them by this capture. */
  area: number
}

export interface CaptureResult {
  owner: string
  /** The loop that was run, as given. */
  ring: Ring
  /** Area enclosed by the loop, whoever held it before. */
  areaClaimed: number
  /** Area this owner did not already hold — what the run actually added. */
  areaGained: number
  /** What each other owner lost, largest first. Empty when nobody lost any. */
  stolen: StolenFrom[]
  /** The owner's territory after the capture. */
  territory: MultiPolygon
  /** Their total afterwards, in square metres. */
  totalArea: number
}

export interface LeaderboardEntry {
  owner: string
  area: number
  /** Number of separate pieces they hold. */
  pieces: number
}

/**
 * Territories by owner.
 *
 * ```ts
 * const territories = new TerritoryStore()
 * territories.on('capture', ({ owner, areaGained, stolen }) => {
 *   toast(`${owner} claimed ${formatArea(areaGained)}`)
 * })
 * territories.capture('sam', loop.ring)
 * ```
 */
export class TerritoryStore extends Evented {
  // `declare` and assignment in `initialize`, not field initialisers: the base
  // Class calls `initialize` from its constructor, so initialisers would run
  // afterwards and overwrite whatever it set up.
  declare _byOwner: Map<string, MultiPolygon>
  declare _options: Required<TerritoryStoreOptions>

  initialize(options: TerritoryStoreOptions = {}): void {
    this._byOwner = new Map()
    this._options = {
      steal: options.steal ?? true,
      minFragmentArea: options.minFragmentArea ?? 25,
    }
  }

  /**
   * Claim a loop for an owner.
   *
   * The ring is taken as run: it is not validated for self-intersection,
   * because `detectLoop` produces simple rings and a caller supplying their own
   * is entitled to their own definition of a lap.
   */
  capture(owner: string, ring: Ring): CaptureResult {
    // Validated and repaired before anything is measured or merged. A claim
    // built from a GPS trace can carry a lost-lock NaN, cross itself, or cross
    // the antimeridian, and each of those quietly produces a capture worth
    // nothing unless it is dealt with here. Unusable geometry throws
    // `InvalidGeometryError` rather than silently claiming empty ground.
    const claim = prepareClaim(ring)
    const areaClaimed = multiPolygonArea(claim)

    const before = this._byOwner.get(owner) ?? []
    const gained = difference(claim, before)
    const areaGained = multiPolygonArea(gained)

    const stolen: StolenFrom[] = []

    if (this._options.steal) {
      for (const [other, territory] of this._byOwner) {
        if (other === owner || territory.length === 0)
          continue

        const overlap = intersection(territory, claim)
        if (overlap.length === 0)
          continue

        const lost = multiPolygonArea(overlap)
        if (lost <= 0)
          continue

        const remaining = this._prune(difference(territory, claim))
        this._byOwner.set(other, remaining)
        stolen.push({ owner: other, area: lost })
      }
      stolen.sort((a, b) => b.area - a.area)
    }

    const after = this._prune(union(before, claim))
    this._byOwner.set(owner, after)

    const result: CaptureResult = {
      owner,
      ring,
      areaClaimed,
      areaGained,
      stolen,
      territory: after,
      totalArea: multiPolygonArea(after),
    }

    this.fire('capture', result)
    this.fire('change', { owner })
    return result
  }

  /** An owner's territory. Empty for an owner who holds nothing. */
  get(owner: string): MultiPolygon {
    return this._byOwner.get(owner) ?? []
  }

  /** Replace an owner's territory outright — loading a saved game. */
  set(owner: string, territory: MultiPolygon): this {
    this._byOwner.set(owner, this._prune(territory))
    this.fire('change', { owner })
    return this
  }

  /** An owner's total holding in square metres. */
  areaOf(owner: string): number {
    return multiPolygonArea(this.get(owner))
  }

  /** Every owner who holds anything. */
  owners(): string[] {
    return [...this._byOwner.keys()].filter(owner => (this._byOwner.get(owner) ?? []).length > 0)
  }

  /** Owners by area held, largest first. */
  leaderboard(): LeaderboardEntry[] {
    return this.owners()
      .map(owner => ({
        owner,
        area: this.areaOf(owner),
        pieces: this.get(owner).length,
      }))
      .sort((a, b) => b.area - a.area)
  }

  /** Who holds this spot, if anyone. */
  ownerAt(position: Position): string | null {
    for (const [owner, territory] of this._byOwner) {
      if (contains(territory, position))
        return owner
    }
    return null
  }

  /**
   * What an owner would gain by closing this loop, without claiming it.
   *
   * For showing a runner what a lap is worth while they are still running it.
   */
  preview(owner: string, ring: Ring): { areaGained: number, stolen: StolenFrom[] } {
    const claim = prepareClaim(ring)
    const before = this._byOwner.get(owner) ?? []
    const areaGained = multiPolygonArea(difference(claim, before))

    const stolen: StolenFrom[] = []
    if (this._options.steal) {
      for (const [other, territory] of this._byOwner) {
        if (other === owner || territory.length === 0)
          continue
        const lost = multiPolygonArea(intersection(territory, claim))
        if (lost > 0)
          stolen.push({ owner: other, area: lost })
      }
      stolen.sort((a, b) => b.area - a.area)
    }

    return { areaGained, stolen }
  }

  /** Everything, as a GeoJSON FeatureCollection with `owner` on each feature. */
  toGeoJSON(): {
    type: 'FeatureCollection'
    features: Array<{
      type: 'Feature'
      properties: { owner: string, area: number }
      geometry: { type: 'MultiPolygon', coordinates: MultiPolygon }
    }>
  } {
    return {
      type: 'FeatureCollection',
      features: this.owners().map(owner => ({
        type: 'Feature' as const,
        properties: { owner, area: this.areaOf(owner) },
        geometry: { type: 'MultiPolygon' as const, coordinates: this.get(owner) },
      })),
    }
  }

  /** Load a FeatureCollection produced by `toGeoJSON`. */
  loadGeoJSON(collection: { features?: Array<any> }): this {
    this._byOwner.clear()
    for (const feature of collection.features ?? []) {
      const owner = feature?.properties?.owner
      const geometry = feature?.geometry
      if (typeof owner !== 'string' || !geometry)
        continue

      const coordinates: MultiPolygon = geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon' ? geometry.coordinates : []

      if (coordinates.length === 0)
        continue

      const existing = this._byOwner.get(owner)
      this._byOwner.set(owner, existing ? union(existing, coordinates) : coordinates)
    }
    this.fire('change', {})
    return this
  }

  clear(): this {
    this._byOwner.clear()
    this.fire('change', {})
    return this
  }

  /** Drop pieces too small to matter. */
  _prune(territory: MultiPolygon): MultiPolygon {
    const minimum = this._options.minFragmentArea
    if (minimum <= 0)
      return territory
    return territory.filter(polygon => multiPolygonArea([polygon]) >= minimum)
  }
}

function closeRing(ring: Ring): Ring {
  if (ring.length === 0)
    return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1])
    return ring
  return [...ring, first]
}
