/**
 * Saved places, after Apple Maps: Favorites, and Guides, named collections
 * of places ("Coffee to try", "Lisbon").
 *
 * The store keeps each place once, however many guides it is in, and saves
 * through a backend: `localStorage` by default, or anything with `load` and
 * `save` for keeping them on a server of your own. Guides import and export
 * as GeoJSON, so they travel between apps.
 */

import type { LatLngLike } from '../services/types'
import type { SearchPlace } from './SearchEngine'
import { Evented } from '../core/Events'

export interface SavedPlace {
  id: string
  name: string
  center: LatLngLike
  kind: string
  icon: string
  address?: string
  /** A line of your own: "the one with the garden". */
  note?: string
  savedAt: number
}

export interface Guide {
  id: string
  name: string
  /** Its places, by id, in the order they were added. */
  places: string[]
  createdAt: number
}

export interface SavedData {
  places: Record<string, SavedPlace>
  favorites: string[]
  guides: Guide[]
}

/** Where saved places are kept. Async, so a server can be one. */
export interface SavedPlacesBackend {
  load: () => Promise<SavedData | undefined>
  save: (data: SavedData) => Promise<void>
}

/** `localStorage`, under one key. */
export class LocalStorageSavedPlaces implements SavedPlacesBackend {
  key: string

  constructor(key: string = 'ts-maps-saved-places') {
    this.key = key
  }

  async load(): Promise<SavedData | undefined> {
    try {
      const raw = globalThis.localStorage?.getItem(this.key)
      return raw ? JSON.parse(raw) as SavedData : undefined
    }
    catch {
      return undefined
    }
  }

  async save(data: SavedData): Promise<void> {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify(data))
    }
    catch {}
  }
}

/** In memory only, for tests and for a page that saves nowhere. */
export class MemorySavedPlaces implements SavedPlacesBackend {
  data?: SavedData

  async load(): Promise<SavedData | undefined> {
    return this.data ? structuredClone(this.data) : undefined
  }

  async save(data: SavedData): Promise<void> {
    this.data = structuredClone(data)
  }
}

export interface SavedPlacesOptions {
  backend?: SavedPlacesBackend
}

function guideId(): string {
  return `guide-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function toSaved(place: SearchPlace | SavedPlace): SavedPlace {
  return {
    id: place.id,
    name: place.name,
    center: { lat: place.center.lat, lng: place.center.lng },
    kind: place.kind,
    icon: place.icon,
    ...(place.address ? { address: place.address } : {}),
    ...('note' in place && place.note ? { note: place.note } : {}),
    savedAt: 'savedAt' in place ? place.savedAt : Date.now(),
  }
}

/**
 * Favorites and Guides. Every change fires `change` with the whole state,
 * after it has been handed to the backend.
 */
export class SavedPlaces extends Evented {
  backend: SavedPlacesBackend
  _data: SavedData = { places: {}, favorites: [], guides: [] }
  _ready: Promise<void> | null = null

  constructor(options: SavedPlacesOptions = {}) {
    super()
    this.backend = options.backend ?? new LocalStorageSavedPlaces()
  }

  ready(): Promise<void> {
    this._ready ??= this.backend.load().then((data) => {
      if (data)
        this._data = { places: data.places ?? {}, favorites: data.favorites ?? [], guides: data.guides ?? [] }
    }, () => {})
    return this._ready
  }

  /** Favorites, most recently saved first. */
  get favorites(): SavedPlace[] {
    return this._data.favorites.map(id => this._data.places[id]!).filter(Boolean).reverse()
  }

  get guides(): Guide[] {
    return this._data.guides.map(g => ({ ...g, places: [...g.places] }))
  }

  /** A guide's places, in order. */
  guidePlaces(id: string): SavedPlace[] {
    const guide = this._data.guides.find(g => g.id === id)
    return guide ? guide.places.map(p => this._data.places[p]!).filter(Boolean) : []
  }

  get(id: string): SavedPlace | undefined {
    return this._data.places[id]
  }

  isFavorite(id: string): boolean {
    return this._data.favorites.includes(id)
  }

  /** Whether a place is saved anywhere: a favorite or in a guide. */
  isSaved(id: string): boolean {
    return this.isFavorite(id) || this._data.guides.some(g => g.places.includes(id))
  }

  async favorite(place: SearchPlace | SavedPlace): Promise<SavedPlace> {
    await this.ready()
    const saved = this._data.places[place.id] ?? toSaved(place)
    this._data.places[place.id] = saved
    if (!this._data.favorites.includes(place.id))
      this._data.favorites.push(place.id)
    await this._commit()
    return saved
  }

  async unfavorite(id: string): Promise<void> {
    await this.ready()
    this._data.favorites = this._data.favorites.filter(f => f !== id)
    this._forget(id)
    await this._commit()
  }

  /** Favorite it if it is not, unfavorite it if it is. Whether it now is. */
  async toggleFavorite(place: SearchPlace | SavedPlace): Promise<boolean> {
    await this.ready()
    if (this.isFavorite(place.id)) {
      await this.unfavorite(place.id)
      return false
    }
    await this.favorite(place)
    return true
  }

  async createGuide(name: string, places: Array<SearchPlace | SavedPlace> = []): Promise<Guide> {
    await this.ready()
    const guide: Guide = { id: guideId(), name: name.trim() || 'New Guide', places: [], createdAt: Date.now() }
    for (const place of places) {
      this._data.places[place.id] ??= toSaved(place)
      if (!guide.places.includes(place.id))
        guide.places.push(place.id)
    }
    this._data.guides.push(guide)
    await this._commit()
    return { ...guide, places: [...guide.places] }
  }

  async renameGuide(id: string, name: string): Promise<void> {
    await this.ready()
    const guide = this._data.guides.find(g => g.id === id)
    if (guide && name.trim()) {
      guide.name = name.trim()
      await this._commit()
    }
  }

  async deleteGuide(id: string): Promise<void> {
    await this.ready()
    const guide = this._data.guides.find(g => g.id === id)
    if (!guide)
      return
    this._data.guides = this._data.guides.filter(g => g.id !== id)
    for (const place of guide.places)
      this._forget(place)
    await this._commit()
  }

  async addToGuide(id: string, place: SearchPlace | SavedPlace): Promise<void> {
    await this.ready()
    const guide = this._data.guides.find(g => g.id === id)
    if (!guide)
      throw new Error(`No guide ${id}`)
    this._data.places[place.id] ??= toSaved(place)
    if (!guide.places.includes(place.id))
      guide.places.push(place.id)
    await this._commit()
  }

  async removeFromGuide(id: string, placeId: string): Promise<void> {
    await this.ready()
    const guide = this._data.guides.find(g => g.id === id)
    if (!guide)
      return
    guide.places = guide.places.filter(p => p !== placeId)
    this._forget(placeId)
    await this._commit()
  }

  /** A place no longer a favorite or in any guide is dropped. */
  _forget(id: string): void {
    if (!this.isSaved(id))
      delete this._data.places[id]
  }

  async _commit(): Promise<void> {
    await this.backend.save(this._data)
    this.fire('change', { favorites: this.favorites, guides: this.guides })
  }

  /**
   * A guide, or the favorites, as GeoJSON: one point per place, with its
   * name, kind and note, and the guide's name on the collection.
   */
  toGeoJSON(guide?: string): { type: 'FeatureCollection', name: string, features: Array<Record<string, unknown>> } {
    const found = guide ? this._data.guides.find(g => g.id === guide) : undefined
    const places = guide ? this.guidePlaces(guide) : this.favorites
    return {
      type: 'FeatureCollection',
      name: found?.name ?? 'Favorites',
      features: places.map(p => ({
        type: 'Feature',
        id: p.id,
        geometry: { type: 'Point', coordinates: [p.center.lng, p.center.lat] },
        properties: { name: p.name, kind: p.kind, icon: p.icon, ...(p.address ? { address: p.address } : {}), ...(p.note ? { note: p.note } : {}) },
      })),
    }
  }

  /**
   * Points from GeoJSON as a new guide, named after the collection or
   * `name`. Features without a point or a name are skipped.
   */
  async importGeoJSON(geojson: { name?: string, features?: Array<Record<string, any>> }, name?: string): Promise<Guide> {
    const places: SavedPlace[] = []
    for (const [i, feature] of (geojson.features ?? []).entries()) {
      const coords = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : undefined
      const props = feature.properties ?? {}
      const title = props.name ?? props.title
      if (!Array.isArray(coords) || typeof title !== 'string')
        continue
      places.push({
        id: String(feature.id ?? props.id ?? `imported:${coords[1].toFixed(5)},${coords[0].toFixed(5)}:${i}`),
        name: title,
        center: { lat: Number(coords[1]), lng: Number(coords[0]) },
        kind: String(props.kind ?? 'place'),
        icon: String(props.icon ?? 'place'),
        ...(props.address ? { address: String(props.address) } : {}),
        ...(props.note ? { note: String(props.note) } : {}),
        savedAt: Date.now(),
      })
    }
    return this.createGuide(name ?? geojson.name ?? 'Imported', places)
  }
}

let shared: SavedPlaces | undefined

/** The page's saved places, in `localStorage`. */
export function savedPlaces(options?: SavedPlacesOptions): SavedPlaces {
  shared ??= new SavedPlaces(options)
  return shared
}

/** Replace the page's saved places: with a server-backed store, say, or `null` to forget it. */
export function setSavedPlaces(places: SavedPlaces | null): void {
  shared = places ?? undefined
}
