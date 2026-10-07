/**
 * More about a place than search knows: its hours, phone and website.
 *
 * Search finds a place by its name, kind and position; Apple's card also
 * says whether it is open, and offers to call it or open its website. Those
 * are OpenStreetMap tags (`opening_hours`, `phone`, `website`), which vector
 * tiles leave out. A `PlaceDetailsProvider` fetches them when a place is
 * chosen, and the card fills them in as they arrive. The default asks
 * Overpass, by the place's OpenStreetMap id where search has one, and by its
 * name nearby where not.
 */

import type { RateLimitOptions } from '../services/rate-limit'
import type { SearchPlace } from './SearchEngine'
import { message } from '../i18n'
import { RateLimiter } from '../services/rate-limit'

export interface PlaceDetails {
  /** OpenStreetMap's `opening_hours`, as written: `Mo-Fr 08:00-18:00; Sa 10:00-14:00`. */
  openingHours?: string
  phone?: string
  website?: string
  email?: string
  /** `italian;pizza`. */
  cuisine?: string
  /** `yes`, `limited`, `no`. */
  wheelchair?: string
  /** The OpenStreetMap object the details came from. */
  osm?: { type: 'node' | 'way' | 'relation', id: number }
}

export interface PlaceDetailsProvider {
  name: string
  details: (place: SearchPlace, options?: { signal?: AbortSignal }) => Promise<PlaceDetails | undefined>
}

const OSM_TYPES: Record<string, 'node' | 'way' | 'relation'> = { N: 'node', W: 'way', R: 'relation', node: 'node', way: 'way', relation: 'relation' }

/** The OpenStreetMap object a search result names, from Photon's or Nominatim's properties. */
export function osmRef(place: SearchPlace): { type: 'node' | 'way' | 'relation', id: number } | undefined {
  const props = place.properties ?? {}
  const type = OSM_TYPES[String(props.osm_type ?? '')]
  const id = Number(props.osm_id)
  return type && Number.isInteger(id) && id > 0 ? { type, id } : undefined
}

/** A place's details from its tags. */
export function detailsFromTags(tags: Record<string, string>, osm?: PlaceDetails['osm']): PlaceDetails {
  const pick = (...keys: string[]): string | undefined => keys.map(k => tags[k]).find(v => typeof v === 'string' && v.trim())
  const out: PlaceDetails = {}
  const set = <K extends keyof PlaceDetails>(key: K, value: PlaceDetails[K] | undefined): void => {
    if (value !== undefined)
      out[key] = value
  }
  set('openingHours', pick('opening_hours'))
  // Several numbers are `;`-separated: the first is the one to call.
  set('phone', pick('phone', 'contact:phone')?.split(';')[0]!.trim())
  set('website', pick('website', 'contact:website', 'url'))
  set('email', pick('email', 'contact:email'))
  set('cuisine', pick('cuisine'))
  set('wheelchair', pick('wheelchair'))
  set('osm', osm)
  return out
}

export interface OverpassPlaceDetailsOptions {
  /** Default the public `overpass-api.de` instance. */
  endpoint?: string
  rateLimit?: RateLimitOptions
  /** Injectable for tests. */
  fetch?: typeof fetch
}

/** Details from OpenStreetMap, through the Overpass API. */
export class OverpassPlaceDetails implements PlaceDetailsProvider {
  name: string = 'overpass'
  private endpoint: string
  private limiter: RateLimiter
  private fetcher?: typeof fetch

  constructor(options: OverpassPlaceDetailsOptions = {}) {
    this.endpoint = options.endpoint ?? 'https://overpass-api.de/api/interpreter'
    this.limiter = new RateLimiter(this.name, options.rateLimit)
    this.fetcher = options.fetch
  }

  /** The query for a place: by id where search knows it, by name within 50 m where not. */
  query(place: SearchPlace): string {
    const ref = osmRef(place)
    if (ref)
      return `[out:json][timeout:10];${ref.type}(${ref.id});out tags;`
    const name = place.name.replace(/["\\]/g, '\\$&')
    return `[out:json][timeout:10];nwr(around:50,${place.center.lat.toFixed(6)},${place.center.lng.toFixed(6)})["name"="${name}"];out tags 1;`
  }

  async details(place: SearchPlace, options: { signal?: AbortSignal } = {}): Promise<PlaceDetails | undefined> {
    const url = `${this.endpoint}?data=${encodeURIComponent(this.query(place))}`
    const response = await this.limiter.fetch(url, { signal: options.signal }, this.fetcher ?? fetch)
    if (!response.ok)
      throw new Error(`Overpass request failed: ${response.status} ${response.statusText}`)
    const body = await response.json() as { elements?: Array<{ type: string, id: number, tags?: Record<string, string> }> }
    const element = body.elements?.find(e => e.tags)
    if (!element)
      return undefined
    const type = OSM_TYPES[element.type]
    return detailsFromTags(element.tags!, type ? { type, id: element.id } : undefined)
  }
}

// ---------------------------------------------------------------------------
// opening_hours
// ---------------------------------------------------------------------------

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** Minutes past midnight, `[start, end)`; `end` past 1440 runs into the next day. */
type Span = [number, number]

/** Each weekday's opening spans, Monday first, or undefined for a spec this cannot read. */
export function parseOpeningHours(spec: string): Span[][] | undefined {
  const week: Span[][] = DAYS.map(() => [])
  const text = spec.trim()
  if (!text)
    return undefined
  if (/^24\/7$/.test(text))
    return DAYS.map(() => [[0, 1440]])
  for (const raw of text.split(/;|\|\|/)) {
    const rule = raw.trim()
    if (!rule)
      continue
    // `Mo-Fr,Su 08:00-12:00,13:00-17:00`, `Sa off`, `08:00-18:00`.
    const match = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/)
    if (!match)
      return undefined
    const [, selector, rest = ''] = match
    const days = new Set<number>()
    if (selector) {
      for (const part of selector.split(',').map(p => p.trim())) {
        // Holidays need a calendar this does not have; the rest still stands.
        if (part === 'PH' || part === 'SH')
          continue
        const [a, b] = part.split('-')
        const from = DAYS.indexOf(a!)
        const to = b ? DAYS.indexOf(b) : from
        for (let d = from; ; d = (d + 1) % 7) {
          days.add(d)
          if (d === to)
            break
        }
      }
      if (!days.size)
        continue
    }
    else {
      DAYS.forEach((_, d) => days.add(d))
    }
    const times = rest.trim()
    let spans: Span[]
    if (/^(?:off|closed)$/i.test(times)) {
      spans = []
    }
    else if (/^24\/7$/.test(times) || times === '00:00-24:00') {
      spans = [[0, 1440]]
    }
    else {
      spans = []
      for (const range of times.split(',').map(r => r.trim())) {
        const m = range.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/)
        if (!m)
          return undefined
        const start = Number(m[1]) * 60 + Number(m[2])
        let end = Number(m[3]) * 60 + Number(m[4])
        if (end <= start)
          end += 1440
        spans.push([start, end])
      }
    }
    // A later rule replaces an earlier one for the days it names.
    for (const d of days)
      week[d] = spans
  }
  return week
}

export interface OpeningStatus {
  open: boolean
  /** Open all day, every day. */
  always?: boolean
  /** When it next closes, while open. */
  closes?: Date
  /** When it next opens, while closed: undefined if not this week. */
  opens?: Date
}

/** Whether a place with these `opening_hours` is open at `now`, and until when. */
export function openingStatus(spec: string, now: Date = new Date()): OpeningStatus | undefined {
  const week = parseOpeningHours(spec)
  if (!week)
    return undefined
  if (week.every(day => day.length === 1 && day[0]![0] === 0 && day[0]![1] >= 1440))
    return { open: true, always: true }
  const today = (now.getDay() + 6) % 7
  const minute = now.getHours() * 60 + now.getMinutes()
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const at = (dayOffset: number, minutes: number): Date => {
    const date = new Date(midnight)
    date.setDate(date.getDate() + dayOffset)
    date.setMinutes(minutes)
    return date
  }
  // Open now: a span today, or one from yesterday running past midnight.
  for (const [offset, day] of [[0, today], [-1, (today + 6) % 7]] as const) {
    for (const [start, end] of week[day]!) {
      const m = minute - offset * 1440
      if (m >= start && m < end)
        return { open: true, closes: at(offset, end) }
    }
  }
  for (let ahead = 0; ahead < 7; ahead++) {
    const starts = week[(today + ahead) % 7]!.map(([start]) => start).filter(start => ahead > 0 || start > minute).sort((a, b) => a - b)
    if (starts.length)
      return { open: false, opens: at(ahead, starts[0]!) }
  }
  return { open: false }
}

/**
 * "Open · Closes 9 PM", "Closed · Opens tomorrow 8 AM", "Open 24 hours";
 * "Geöffnet · Schließt um 21 Uhr" in German.
 */
export function describeOpening(status: OpeningStatus, now: Date = new Date(), locale?: string): string {
  if (status.always)
    return message(locale, 'opening.always')
  const time = (date: Date): string => date.toLocaleTimeString(locale, date.getMinutes() ? { hour: 'numeric', minute: '2-digit' } : { hour: 'numeric' })
  // A closing time just past midnight is tonight's, said without a day.
  const when = (date: Date, lateNight: boolean): string => {
    const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5)
    if (days === 0 || (days === 1 && lateNight && date.getHours() < 6))
      return message(locale, 'opening.today', { time: time(date) })
    if (days === 1)
      return message(locale, 'opening.tomorrow', { time: time(date) })
    return message(locale, 'opening.weekday', { day: date.toLocaleDateString(locale, { weekday: 'short' }), time: time(date) })
  }
  if (status.open)
    return status.closes ? message(locale, 'opening.closes', { when: when(status.closes, true) }) : message(locale, 'opening.open')
  return status.opens ? message(locale, 'opening.opens', { when: when(status.opens, false) }) : message(locale, 'opening.closed')
}
